// BARMASTER JavaScript Application - Optimizado
class Barmaster {
    constructor() {
        this.sectionIds = ['inicio', 'recetas', 'receta', 'favoritos', 'historia', 'acerca'];
        this.themeStorageKey = 'barmaster-theme';
        this.favoritesKey = 'barmaster-favorites';
        this.coursesKey = 'barmaster-courses';
        // Lazy loading: no cargar recetas inmediatamente
        this.recipes = null;
        this.filteredRecipes = null;
        this.favorites = [];
        this.courseProgress = {};
        // Cache para elementos DOM frecuentemente accedidos
        this.domCache = new Map();
        // Debounce timers
        this.debounceTimers = new Map();
        this.init();
    }

    
    async init() {
        try {
            this.initCookieBanner();
            this.bindTheme();
            this.initFilterToggle();
            this.applyInitialTheme();
            this.loadFavorites();
            this.loadCourses();
            this.initRecommendationEngine();
            this.bindEventListeners();
            this.checkInitialSection();
            this.initDynamicTitles();
            
            // Lazy load recetas solo cuando se necesiten
            await this.lazyLoadRecipes();
            
            // Renderizado diferido para no bloquear UI
            requestIdleCallback(() => {
                this.renderFavorites();
                this.renderCourses();
                // Inicializar recomendaciones después de cargar recetas
                if (this.recipes) {
                    this.renderRecommendations('recommendationsContainer');
                }
            });
        } catch (error) {
            console.error('Error initializing Barmaster:', error);
        }
    }

    // Lazy loading de recetas
    async lazyLoadRecipes() {
        if (!this.recipes) {
            this.recipes = this.initRecipes();
            this.filteredRecipes = [...this.recipes];
            
            // Solo renderizar si estamos en la sección de recetas
            const currentSection = window.location.hash.replace('#', '') || 'inicio';
            if (currentSection === 'recetas' || currentSection === 'inicio') {
                this.renderRecipes(this.recipes);
            }
        }
    }

    initFilterToggle() {
        const toggle = document.getElementById('filterToggle');
        const categories = document.getElementById('filterCategories');
        
        if (toggle && categories) {
            toggle.addEventListener('click', () => {
                toggle.classList.toggle('active');
                categories.classList.toggle('active');
            });
        }
    }

    // Utilidad: Debounce para eventos frecuentes
    debounce(key, func, wait = 300) {
        if (this.debounceTimers.has(key)) {
            clearTimeout(this.debounceTimers.get(key));
        }
        const timer = setTimeout(() => {
            func();
            this.debounceTimers.delete(key);
        }, wait);
        this.debounceTimers.set(key, timer);
    }

    // Utilidad: Cache de elementos DOM
    getElement(id) {
        if (!this.domCache.has(id)) {
            const element = document.getElementById(id);
            if (element) {
                this.domCache.set(id, element);
            }
            return element;
        }
        return this.domCache.get(id);
    }

    // Utilidad: Intersection Observer para lazy loading de imágenes/elementos
    observeElement(element, callback, options = {}) {
        if (!('IntersectionObserver' in window)) {
            callback();
            return;
        }
        
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    callback(entry.target);
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.1, ...options });
        
        observer.observe(element);
        return observer;
    }

    // Utilidad: Chunked rendering para grandes listas
    renderChunked(items, renderFn, chunkSize = 10, container) {
        let index = 0;
        const fragment = document.createDocumentFragment();
        
        const renderChunk = () => {
            const chunk = items.slice(index, index + chunkSize);
            chunk.forEach(item => {
                const element = renderFn(item);
                if (element) fragment.appendChild(element);
            });
            
            index += chunkSize;
            
            if (index < items.length) {
                requestAnimationFrame(renderChunk);
            } else {
                container.appendChild(fragment);
            }
        };
        
        renderChunk();
    }

    // Sistema de Recomendaciones Inteligente
    initRecommendationEngine() {
        this.userInteractions = this.loadUserInteractions();
        this.recommendationWeights = {
            alcohol: 0.3,
            flavor: 0.25,
            difficulty: 0.2,
            occasion: 0.15,
            technique: 0.1
        };
    }

    loadUserInteractions() {
        const stored = localStorage.getItem('barmaster-interactions');
        return stored ? JSON.parse(stored) : {
            viewedRecipes: [],
            favoriteRecipes: [],
            searchQueries: [],
            timeSpent: {}
        };
    }

    saveUserInteraction(type, data) {
        this.userInteractions[type].push({
            ...data,
            timestamp: Date.now()
        });
        localStorage.setItem('barmaster-interactions', JSON.stringify(this.userInteractions));
    }

    getRecommendations(currentRecipeId = null, limit = 4) {
        if (!this.recipes) return [];
        
        const currentRecipe = currentRecipeId ? 
            this.recipes.find(r => r.id === currentRecipeId) : null;
        
        let recommendations = [];
        
        // Recetas similares basadas en la actual
        if (currentRecipe) {
            const similar = this.getSimilarRecipes(currentRecipe, 3);
            recommendations = recommendations.concat(similar);
        }
        
        // Recetas populares basadas en interacciones
        const popular = this.getPopularRecipes(3);
        recommendations = recommendations.concat(popular);
        
        // Recetas basadas en preferencias
        const personalized = this.getPersonalizedRecipes(2);
        recommendations = recommendations.concat(personalized);
        
        // Eliminar duplicados y limitar
        const unique = recommendations.filter((recipe, index, self) =>
            index === self.findIndex(r => r.id === recipe.id)
        );
        
        return unique.slice(0, limit);
    }

    getSimilarRecipes(currentRecipe, limit = 3) {
        return this.recipes
            .filter(recipe => recipe.id !== currentRecipe.id)
            .map(recipe => ({
                ...recipe,
                score: this.calculateSimilarityScore(currentRecipe, recipe)
            }))
            .sort((a, b) => b.score - a.score)
            .slice(0, limit)
            .map(item => ({ ...item, reason: 'similar' }));
    }

    calculateSimilarityScore(recipe1, recipe2) {
        let score = 0;
        
        // Mismo tipo de alcohol
        if (recipe1.alcohol === recipe2.alcohol) score += 0.4;
        
        // Mismo sabor
        if (recipe1.flavor === recipe2.flavor) score += 0.3;
        
        // Misma dificultad
        if (recipe1.difficulty === recipe2.difficulty) score += 0.2;
        
        // Misma ocasión
        if (recipe1.occasion === recipe2.occasion) score += 0.1;
        
        return score;
    }

    getPopularRecipes(limit = 3) {
        return this.recipes
            .map(recipe => ({
                ...recipe,
                popularity: this.calculatePopularity(recipe)
            }))
            .sort((a, b) => b.popularity - a.popularity)
            .slice(0, limit)
            .map(item => ({ ...item, reason: 'popular' }));
    }

    calculatePopularity(recipe) {
        let score = recipe.rating * 0.5;
        
        // Bonus si está en favoritos del usuario
        if (this.userInteractions.favoriteRecipes.includes(recipe.id)) {
            score += 2;
        }
        
        // Bonus si ha sido vista recientemente
        const recentViews = this.userInteractions.viewedRecipes.filter(
            v => v.recipeId === recipe.id && 
            Date.now() - v.timestamp < 7 * 24 * 60 * 60 * 1000
        );
        score += recentViews.length * 0.1;
        
        return score;
    }

    getPersonalizedRecipes(limit = 2) {
        const preferences = this.extractUserPreferences();
        return this.recipes
            .filter(recipe => recipe.id !== this.userInteractions.viewedRecipes[0]?.recipeId)
            .map(recipe => ({
                ...recipe,
                score: this.calculatePersonalizationScore(recipe, preferences)
            }))
            .sort((a, b) => b.score - a.score)
            .slice(0, limit)
            .map(item => ({ ...item, reason: 'personalized' }));
    }

    extractUserPreferences() {
        const preferences = {
            alcohol: {},
            flavor: {},
            difficulty: {},
            occasion: {}
        };
        
        // Analizar recetas favoritas
        this.userInteractions.favoriteRecipes.forEach(recipeId => {
            const recipe = this.recipes.find(r => r.id === recipeId);
            if (recipe) {
                preferences.alcohol[recipe.alcohol] = (preferences.alcohol[recipe.alcohol] || 0) + 1;
                preferences.flavor[recipe.flavor] = (preferences.flavor[recipe.flavor] || 0) + 1;
                preferences.difficulty[recipe.difficulty] = (preferences.difficulty[recipe.difficulty] || 0) + 1;
                preferences.occasion[recipe.occasion] = (preferences.occasion[recipe.occasion] || 0) + 1;
            }
        });
        
        return preferences;
    }

    calculatePersonalizationScore(recipe, preferences) {
        let score = 0;
        
        score += (preferences.alcohol[recipe.alcohol] || 0) * this.recommendationWeights.alcohol;
        score += (preferences.flavor[recipe.flavor] || 0) * this.recommendationWeights.flavor;
        score += (preferences.difficulty[recipe.difficulty] || 0) * this.recommendationWeights.difficulty;
        score += (preferences.occasion[recipe.occasion] || 0) * this.recommendationWeights.occasion;
        
        return score;
    }

    renderRecommendations(containerId, currentRecipeId = null) {
        const container = this.getElement(containerId);
        if (!container) return;
        
        const recommendations = this.getRecommendations(currentRecipeId);
        
        if (recommendations.length === 0) {
            container.innerHTML = '';
            return;
        }
        
        container.innerHTML = `
            <div class="recommendations-section">
                <h3 class="recommendations-title">
                    <i class="fas fa-magic"></i>
                    Recomendaciones para ti
                </h3>
                <div class="recommendations-grid">
                    ${recommendations.map(recipe => this.createRecommendationCard(recipe)).join('')}
                </div>
            </div>
        `;
    }

    createRecommendationCard(recipe) {
        const reasonIcon = {
            similar: 'fa-copy',
            popular: 'fa-fire',
            personalized: 'fa-user'
        };
        
        const reasonText = {
            similar: 'Similar a lo que buscas',
            popular: 'Popular entre usuarios',
            personalized: 'Basado en tus gustos'
        };
        
        return `
            <div class="recommendation-card" data-recipe-id="${recipe.id}">
                <div class="recommendation-header">
                    <span class="recommendation-reason">
                        <i class="fas ${reasonIcon[recipe.reason]}"></i>
                        ${reasonText[recipe.reason]}
                    </span>
                    <div class="recommendation-rating">
                        <i class="fas fa-star"></i>
                        ${recipe.rating}
                    </div>
                </div>
                <h4 class="recommendation-title">${recipe.name}</h4>
                <p class="recommendation-description">${recipe.description.substring(0, 100)}...</p>
                <div class="recommendation-meta">
                    <span class="recommendation-alcohol">${recipe.alcohol}</span>
                    <span class="recommendation-time">${recipe.time}</span>
                </div>
                <button class="recommendation-btn" onclick="app.viewRecipe('${recipe.id}')">
                    <i class="fas fa-eye"></i>
                    Ver Receta
                </button>
            </div>
        `;
    }

    initCookieBanner() {
        // Banner is now handled by inline script in index.html
        // This prevents duplicate banners
        return;
    }

    // Debug function to reset cookie consent (call in console: app.resetCookieConsent())
    resetCookieConsent() {
        localStorage.removeItem('barmaster-cookie-consent');
        localStorage.removeItem('barmaster-essential-cookies');
        localStorage.removeItem('barmaster-advertising-cookies');
        console.log('Cookie consent reset.');
        // Use global function from index.html
        if (window.showCookieBanner) {
            window.showCookieBanner();
        }
    }

    // Force show cookie banner for testing
    forceShowCookieBanner() {
        if (window.showCookieBanner) {
            window.showCookieBanner();
        }
    }

    showCookieBanner() {
        if (document.getElementById('cookieBanner')) return;
        
        const banner = this.createCookieBanner();
        document.body.appendChild(banner);
        
        const acceptBtn = document.getElementById('acceptCookiesBtn');
        const rejectBtn = document.getElementById('rejectCookiesBtn');
        const settingsBtn = document.getElementById('settingsCookiesBtn');
        const infoLink = document.getElementById('cookieInfoLink');
        
        if (acceptBtn) acceptBtn.onclick = () => this.handleCookieAccept('all');
        if (rejectBtn) rejectBtn.onclick = () => this.handleCookieAccept('none');
        if (settingsBtn) settingsBtn.onclick = () => this.showCookieSettings();
        if (infoLink) {
            infoLink.onclick = (e) => {
                e.preventDefault();
                this.showCookieSettings();
            };
        }
    }

    handleCookieAccept(type) {
        if (type === 'all') {
            localStorage.setItem('barmaster-cookie-consent', 'accepted');
            localStorage.setItem('barmaster-essential-cookies', 'true');
            localStorage.setItem('barmaster-advertising-cookies', 'true');
            this.applyCookiePreferences('accepted');
            this.showNotification('Cookies aceptadas', 'success');
        } else if (type === 'essential') {
            localStorage.setItem('barmaster-cookie-consent', 'essential-only');
            localStorage.setItem('barmaster-essential-cookies', 'true');
            localStorage.removeItem('barmaster-advertising-cookies');
            this.applyCookiePreferences('essential-only');
            this.showNotification('Solo cookies esenciales', 'info');
        } else {
            localStorage.setItem('barmaster-cookie-consent', 'rejected');
            localStorage.removeItem('barmaster-essential-cookies');
            localStorage.removeItem('barmaster-advertising-cookies');
            this.applyCookiePreferences('rejected');
            this.showNotification('Cookies rechazadas', 'info');
        }
        this.hideCookieBanner();
    }

    createCookieBanner() {
        const banner = document.createElement('div');
        banner.id = 'cookieBanner';
        // Use direct colors to ensure visibility
        banner.style.cssText = `
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            background: rgba(30, 30, 30, 0.98);
            backdrop-filter: blur(18px);
            -webkit-backdrop-filter: blur(18px);
            border-top: 2px solid #D4AF37;
            padding: 1.5rem;
            z-index: 99999;
            box-shadow: 0 -10px 40px rgba(0,0,0,0.5);
        `;
        
        banner.innerHTML = `
            <div style="max-width: 1200px; margin: 0 auto; display: flex; align-items: center; gap: 2rem; flex-wrap: wrap; font-family: system-ui, -apple-system, sans-serif;">
                <div style="font-size: 2rem; color: #D4AF37; flex-shrink: 0;">🍪</div>
                <div style="flex: 1; min-width: 200px;">
                    <div style="font-size: 1.2rem; color: #f0f0f0; margin-bottom: 0.5rem; font-weight: 600;">Usamos Cookies</div>
                    <div style="font-size: 0.95rem; color: #aaa; line-height: 1.5; margin-bottom: 0;">
                        Utilizamos cookies esenciales y de publicidad para mejorar tu experiencia.
                        <a href="#" id="cookieInfoLink" style="color: #D4AF37; text-decoration: none; font-weight: 500; margin-left: 5px;">Ver opciones</a>
                    </div>
                </div>
                <div style="display: flex; gap: 1rem; flex-shrink: 0;">
                    <button id="acceptCookiesBtn" style="padding: 0.75rem 1.5rem; border: none; border-radius: 8px; font-weight: 600; font-size: 0.9rem; cursor: pointer; background: #D4AF37; color: #1a1a1a;">Aceptar</button>
                    <button id="rejectCookiesBtn" style="padding: 0.75rem 1.5rem; border: 1px solid #555; border-radius: 8px; font-weight: 600; font-size: 0.9rem; cursor: pointer; background: transparent; color: #ccc;">Rechazar</button>
                    <button id="settingsCookiesBtn" style="padding: 0.75rem 1.5rem; border: 1px solid #D4AF37; border-radius: 8px; font-weight: 600; font-size: 0.9rem; cursor: pointer; background: transparent; color: #f0f0f0;">Configurar</button>
                </div>
            </div>
        `;
        
        return banner;
    }


    showCookieSettings() {
        // Remove existing modal
        const existing = document.getElementById('cookieSettingsModal');
        if (existing) existing.remove();
        const existingBackdrop = document.getElementById('cookieSettingsBackdrop');
        if (existingBackdrop) existingBackdrop.remove();
        
        // Create modal
        const modal = document.createElement('div');
        modal.id = 'cookieSettingsModal';
        modal.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: var(--panel);
            border: 1px solid var(--stroke);
            border-radius: 16px;
            padding: 2rem;
            max-width: 500px;
            width: 90%;
            z-index: 10000;
            box-shadow: 0 20px 60px rgba(0,0,0,0.5);
            opacity: 0;
            transition: opacity 0.3s ease;
        `;
        
        modal.innerHTML = `
            <h3 style="color: var(--gold); margin-bottom: 1rem; font-family: 'Playfair Display', serif;">Configuración de Cookies</h3>
            <div style="margin-bottom: 1.5rem;">
                <p style="margin-bottom: 1rem;"><strong>Cookies Esenciales:</strong> Necesarias para el funcionamiento (tema, favoritos).</p>
                <p style="margin-bottom: 1rem;"><strong>Cookies de Publicidad:</strong> Para mostrar anuncios relevantes.</p>
            </div>
            <div style="display: flex; gap: 1rem; justify-content: flex-end;">
                <button id="essentialOnlyBtn" style="padding: 0.75rem 1.5rem; background: var(--gold); color: var(--bg); border: none; border-radius: 8px; cursor: pointer;">Solo Esenciales</button>
                <button id="acceptAllSettingsBtn" style="padding: 0.75rem 1.5rem; background: var(--gold); color: var(--bg); border: none; border-radius: 8px; cursor: pointer;">Aceptar Todas</button>
                <button id="closeSettingsBtn" style="padding: 0.75rem 1.5rem; background: transparent; color: var(--text); border: 1px solid var(--stroke); border-radius: 8px; cursor: pointer;">Cerrar</button>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Create backdrop
        const backdrop = document.createElement('div');
        backdrop.id = 'cookieSettingsBackdrop';
        backdrop.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0,0,0,0.6);
            z-index: 9999;
            opacity: 0;
            transition: opacity 0.3s ease;
        `;
        backdrop.onclick = () => this.hideCookieSettings();
        document.body.appendChild(backdrop);
        
        // Attach event listeners
        const essentialBtn = document.getElementById('essentialOnlyBtn');
        const acceptAllBtn = document.getElementById('acceptAllSettingsBtn');
        const closeBtn = document.getElementById('closeSettingsBtn');
        
        if (essentialBtn) {
            essentialBtn.onclick = () => {
                this.handleCookieAccept('essential');
                this.hideCookieSettings();
            };
        }
        
        if (acceptAllBtn) {
            acceptAllBtn.onclick = () => {
                this.handleCookieAccept('all');
                this.hideCookieSettings();
            };
        }
        
        if (closeBtn) {
            closeBtn.onclick = () => this.hideCookieSettings();
        }
        
        // Show modal
        requestAnimationFrame(() => {
            modal.style.opacity = '1';
            backdrop.style.opacity = '1';
        });
    }

    hideCookieSettings() {
        const modal = document.getElementById('cookieSettingsModal');
        const backdrop = document.getElementById('cookieSettingsBackdrop');
        
        if (modal) {
            modal.style.opacity = '0';
            setTimeout(() => modal.remove(), 300);
        }
        if (backdrop) {
            backdrop.style.opacity = '0';
            setTimeout(() => backdrop.remove(), 300);
        }
    }

    hideCookieBanner() {
        const banner = document.getElementById('cookieBanner');
        if (banner) {
            banner.remove();
        }
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.classList.add('show');
        }, 100);
        
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => {
                notification.remove();
            }, 300);
        }, 3000);
    }

    
    initTimeline() {
        const timelineEvents = document.querySelectorAll('.timeline-event');
        
        timelineEvents.forEach(event => {
            const marker = event.querySelector('.timeline-marker');
            const content = event.querySelector('.timeline-content');
            const details = event.querySelector('.timeline-details');
            
            if (!marker || !content || !details) return;
            
            // Estado inicial: todos colapsados excepto el primero
            if (event !== timelineEvents[0]) {
                details.classList.add('collapsed');
            } else {
                details.classList.add('expanded');
                marker.classList.add('active');
            }
            
            // Click en el marcador
            marker.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleTimelineEvent(event, details, marker);
            });
            
            // Click en el contenido
            content.addEventListener('click', () => {
                this.toggleTimelineEvent(event, details, marker);
            });
        });
    }

    toggleTimelineEvent(event, details, marker) {
        const isExpanded = details.classList.contains('expanded');
        
        // Cerrar todos los demás eventos
        document.querySelectorAll('.timeline-event').forEach(otherEvent => {
            if (otherEvent !== event) {
                const otherDetails = otherEvent.querySelector('.timeline-details');
                const otherMarker = otherEvent.querySelector('.timeline-marker');
                
                if (otherDetails && otherMarker) {
                    otherDetails.classList.remove('expanded');
                    otherDetails.classList.add('collapsed');
                    otherMarker.classList.remove('active');
                }
            }
        });
        
        // Toggle del evento actual
        if (isExpanded) {
            details.classList.remove('expanded');
            details.classList.add('collapsed');
            marker.classList.remove('active');
        } else {
            details.classList.remove('collapsed');
            details.classList.add('expanded');
            marker.classList.add('active');
            
            // Scroll suave al evento
            event.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }

    
    bindTheme() {
        const btn = document.getElementById('themeToggle');
        if (!btn) {
            return;
        }

        btn.addEventListener('click', () => {
            const next = this.getTheme() === 'light' ? 'dark' : 'light';
            this.setTheme(next);
        });
    }

    applyInitialTheme() {
        if (!this.canUseCookies()) {
            this.setTheme('dark');
            return;
        }
        const saved = localStorage.getItem(this.themeStorageKey);
        if (saved === 'light' || saved === 'dark') {
            this.setTheme(saved);
            return;
        }
        this.setTheme('dark');
    }

    getTheme() {
        const t = document.documentElement.getAttribute('data-theme');
        return t === 'light' ? 'light' : 'dark';
    }

    setTheme(theme) {
        const next = theme === 'light' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        
        if (this.canUseCookies()) {
            localStorage.setItem(this.themeStorageKey, next);
        }

        const btn = document.getElementById('themeToggle');
        if (!btn) {
            return;
        }
        const icon = btn.querySelector('i');
        if (!icon) {
            return;
        }

        if (next === 'light') {
            icon.classList.remove('fa-moon');
            icon.classList.add('fa-sun');
        } else {
            icon.classList.remove('fa-sun');
            icon.classList.add('fa-moon');
        }
    }

    canUseCookies() {
        const consent = localStorage.getItem('barmaster-cookie-consent');
        return consent === 'accepted';
    }

    canUseAdvertisingCookies() {
        const consent = localStorage.getItem('barmaster-advertising-cookies');
        return consent === 'true';
    }

    applyCookiePreferences(consent) {
        if (consent === 'accepted' || consent === 'essential-only') {
            this.loadFavorites();
            this.loadCourses();
            if (consent === 'accepted' && this.canUseAdvertisingCookies()) {
                this.initAdvertising();
            }
        } else {
            this.favorites = [];
            this.courseProgress = {};
        }
    }

    initAdvertising() {
        const adContainer = document.getElementById('adContainer');
        if (adContainer) adContainer.style.display = 'block';
    }

    loadAdSense() {
        // Google AdSense implementation placeholder
        const script = document.createElement('script');
        script.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js';
        script.async = true;
        script.crossOrigin = 'anonymous';
        document.head.appendChild(script);
        
        // Initialize ads
        (window.adsbygoogle = window.adsbygoogle || []).push({
            google_ad_client: "ca-pub-XXXXXXXXXXXXXXXX", // Replace with actual publisher ID
            enable_page_level_ads: true
        });
    }

    loadAnalytics() {
        // Google Analytics 4 implementation placeholder
        const script = document.createElement('script');
        script.async = true;
        script.src = 'https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXXXX'; // Replace with actual measurement ID
        document.head.appendChild(script);
        
        window.dataLayer = window.dataLayer || [];
        function gtag(){dataLayer.push(arguments);}
        gtag('js', new Date());
        gtag('config', 'G-XXXXXXXXXX'); // Replace with actual measurement ID
    }

    loadRetargeting() {
        // Facebook Pixel or other retargeting implementation placeholder
        const script = document.createElement('script');
        script.innerHTML = `
            !function(f,b,e,v,n,t,s)
            {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
            n.callMethod.apply(n,arguments):n.queue.push(arguments)};
            if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
            n.queue=[];t=b.createElement(e);t.async=!0;
            t.src=v;s=b.getElementsByTagName(e)[0];
            s.parentNode.insertBefore(t,s)}(window, document,'script',
            'https://connect.facebook.net/en_US/fbevents.js');
            fbq('init', 'XXXXXXXXXXXXXXXX'); // Replace with actual pixel ID
            fbq('track', 'PageView');
        `;
        document.head.appendChild(script);
    }

    saveCourseProgress() {
        if (!this.canUseCookies()) {
            this.showNotification('No se puede guardar progreso sin aceptar cookies', 'warning');
            return;
        }
        localStorage.setItem(this.coursesKey, JSON.stringify(this.courseProgress));
    }

    // Recipe Database with Extended Properties
    initRecipes() {
        return [
            {
                id: 'negroni',
                name: 'Negroni Clásico',
                description: 'Equilibrio perfecto entre amargo y dulce, creado en 1919 por el Conde Camillo Negroni en Florencia, Italia, cuando pidió que su Americano se fortaleciera con gin en lugar de soda.',
                ingredients: ['1 oz Gin', '1 oz Campari', '1 oz Vermouth Rojo'],
                instructions: 'PASO 1: Enfriar copa old-fashioned llenándola con hielo y agua por 30 segundos. PASO 2: Desechar el agua y agregar hielo fresco. PASO 3: Añadir 1 oz gin, 1 oz campari, 1 oz vermut rojo. PASO 4: Revolver suavemente con cuchara de bar 20 segundos. PASO 5: Colar en copa fría sin hielo. PASO 6: Completar con prosecco bien frío. PASO 7: Decorar con cáscara de naranja. CONSEJOS: Usa gin italiano como Tanqueray o Bombay Sapphire. El prosecco debe estar bien frío y seco. El vermut rojo debe estar refrigerado. El nombre sbagliato significa "equivocado" en italiano.',
                alcohol: 'gin',
                flavor: 'amargo',
                difficulty: 'medio',
                glass: 'old-fashioned',
                technique: 'revolver',
                occasion: 'aperitivo',
                time: '5 min',
                rating: 4.8,
                year: '1919',
                origin: 'Italia'
            },
            {
                id: 'gin-tonic',
                name: 'Gin Tonic Perfecta',
                description: 'Clásico refrescante con notas botánicas y cítricos, originario en la India colonial donde los soldados británicos mezclaban gin con agua tónica para combatir la malaria, popularizado mundialmente desde 1830.',
                ingredients: ['2 oz Gin', '4 oz Tónica', '1/2 Lima', 'Hojas de albahaca'],
                instructions: 'PASO 1: Llenar vaso highball completamente con hielo. PASO 2: Añadir 2 oz de gin. PASO 3: Cortar media lima por la mitad, exprimir el jugo directamente en el vaso. PASO 4: Dejar caer la media lima exprimida en el vaso. PASO 5: Completar con 4 oz de agua tónica fría. PASO 6: Remover suavemente una sola vez. PASO 7: Decorar con hojas frescas de albahaca. CONSEJOS: Usa gin con notas botánicas como Hendricks o The Botanist. El agua tónica debe estar bien fría. No exprimas demasiado la lima. La albahaca complementa perfectamente las notas botánicas del gin.',
                alcohol: 'gin',
                flavor: 'cítrico',
                difficulty: 'fácil',
                glass: 'highball',
                technique: 'construir',
                occasion: 'fiesta',
                time: '3 min',
                rating: 4.6,
                year: '1830',
                origin: 'India'
            },
            {
                id: 'old-fashioned',
                name: 'Old Fashioned',
                description: 'El whisky en su máxima expresión, un clásico atemporal creado en el siglo XIX en Louisville, Kentucky, considerado el abuelo de todos los cócteles de whisky y uno de los más antiguos registrados.',
                ingredients: ['2 oz de Whisky Bourbon', '1 terrón de azúcar', '2-3 dashes de Angostura', '1 dash de agua'],
                instructions: 'PASO 1: Colocar 1 terrón de azúcar en vaso old-fashioned. PASO 2: Añadir 2-3 dashes de Angostura y 1 dash de agua. PASO 3: Macerar suavemente hasta disolver el azúcar. PASO 4: Añadir 2 oz de whisky bourbon. PASO 5: Llenar con hielo grande. PASO 6: Revolver con cuchara de bar por 30 segundos. PASO 7: Expresar cáscara de naranja sobre la bebida y decorar. CONSEJOS: Usa bourbon de buena calidad como Woodford Reserve o Buffalo Trace. El azúcar moreno da mejor sabor. No uses hielo triturado. Revolver lentamente evita sobre-dilución.',
                alcohol: 'whisky',
                flavor: 'amargo',
                difficulty: 'medio',
                glass: 'old-fashioned',
                technique: 'revolver',
                occasion: 'clásico',
                time: '5 min',
                rating: 4.9,
                year: '1880',
                origin: 'EEUU'
            },
            {
                id: 'cosmopolitan',
                name: 'Cosmopolitan',
                description: 'Elegancia y dulzura en un sorbo, icónico de los años 90, creado en 1975 por el bartender Cheryl Cook en Miami, Florida, y popularizado mundialmente por la serie Sex and the City.',
                ingredients: ['1.5 oz de Vodka Citron', '1 oz de Cranberry', '0.5 oz de Triple Sec', '0.5 oz de Lima fresca'],
                instructions: 'PASO 1: Enfriar copa martini en congelador 10 minutos. PASO 2: Llenar shaker con hielo. PASO 3: Añadir 1.5 oz de vodka citron, 1 oz de cranberry, 0.5 oz de triple sec, 0.5 oz de lima fresca. PASO 4: Sacudir vigorosamente 15 segundos hasta escarcha exterior. PASO 5: Colar en copa martini. PASO 6: Decorar con rodaja de lima en el borde. CONSEJOS: Usa vodka citron o flavored con limón. El cranberry debe ser 100% puro sin azúcar. La lima debe estar fresca y exprimida al momento. No sobre-llenes la copa.',
                alcohol: 'vodka',
                flavor: 'dulce',
                difficulty: 'fácil',
                glass: 'martini',
                technique: 'agitar',
                occasion: 'romántico',
                time: '4 min',
                rating: 4.5,
                year: '1988',
                origin: 'EEUU'
            },
            {
                id: 'margarita-clasica',
                name: 'Margarita Clásica',
                description: 'El cóctel mexicano por excelencia, perfecto y balanceado, creado en 1938 en Ensenada, México, por el bartender Carlos "Danny" Herrera en honor a su amante Margarita Henkel.',
                ingredients: ['2 oz de Tequila Blanco', '1 oz de Triple Sec', '1 oz de Lima fresca'],
                instructions: 'PASO 1: Preparar borde de sal: humedecer borde de vaso highball con lima, sumergir en sal gruesa. PASO 2: Llenar vaso con hielo fresco. PASO 3: Añadir 2 oz de tequila blanco. PASO 4: Añadir 0.5 oz de jugo de lima fresco. PASO 5: Completar con grapefruit soda bien fría. PASO 6: Remover suavemente una vez. PASO 7: Decorar con rodaja de lima. CONSEJOS: Usa tequila blanco 100% agave como Don Julio o Patron. El grapefruit soda debe ser Squirt o Jarritos para autenticidad. La sal debe ser marina gruesa. Sirve inmediatamente para mantener carbonatación.',
                alcohol: 'tequila',
                flavor: 'cítrico',
                difficulty: 'fácil',
                glass: 'copa',
                technique: 'agitar',
                occasion: 'fiesta',
                time: '4 min',
                rating: 4.7,
                year: '1938',
                origin: 'México'
            },
            {
                id: 'mojito',
                name: 'Mojito Cubano',
                description: 'Refrescante y tropical, el cóctel del verano, originario de Cuba en el siglo XVI, aunque su versión moderna fue creada en La Habana en los años 1930 y popularizado por Ernest Hemingway.',
                ingredients: ['2 oz Ron Blanco', '1 oz Lima', '2 cucharadas azúcar', 'Menta fresca', 'Soda'],
                instructions: 'PASO 1: Colocar 10-12 hojas de menta fresca en vaso highball. PASO 2: Añadir 2 cucharadas de azúcar y 1 oz de jugo de lima. PASO 3: Macerar suavemente con muddler 5-6 veces. PASO 4: Añadir 2 oz de ron blanco. PASO 5: Llenar con hielo triturado. PASO 6: Completar con soda fría. PASO 7: Remover suavemente y decorar con ramita de menta. CONSEJOS: No machacar la menta demasiado - se vuelve amarga. Usa menta fresca y vibrante. El ron debe ser blanco y ligero. La soda debe estar bien fría. Sirve inmediatamente.',
                alcohol: 'ron',
                flavor: 'frutal',
                difficulty: 'fácil',
                glass: 'highball',
                technique: 'construir',
                occasion: 'fiesta',
                time: '5 min',
                rating: 4.8,
                year: '1930',
                origin: 'Cuba'
            },
            {
                id: 'daiquiri',
                name: 'Daiquiri Clásico',
                description: 'Simple pero perfecto, la esencia del ron y lima, creado en 1896 en Cuba por Jennings Cox, un ingeniero estadounidense minero de bauxita, como refresco para combatir el calor tropical.',
                ingredients: ['2 oz de Ron Blanco', '1 oz de Lima fresca', '0.75 oz de Azúcar'],
                instructions: 'PASO 1: Enfriar copa coupe en congelador 10 minutos. PASO 2: Llenar shaker con hielo. PASO 3: Añadir 2 oz de ron blanco, 1 oz de lima fresca, 0.75 oz de jarabe de azúcar. PASO 4: Sacudir vigorosamente 12-15 segundos. PASO 5: Colar en copa fría sin hielo. CONSEJOS: Usa ron blanco cubano como Havana Club 3 años. El jarabe debe estar hecho 1:1 azúcar:agua. La lima debe estar fresca. Este cóctel debe servirse sin hielo para mantener la concentración de sabores.',
                alcohol: 'ron',
                flavor: 'cítrico',
                difficulty: 'fácil',
                glass: 'coupe',
                technique: 'agitar',
                occasion: 'clásico',
                time: '3 min',
                rating: 4.6,
                year: '1896',
                origin: 'Cuba'
            },
            {
                id: 'manhattan',
                name: 'Manhattan',
                description: 'Sophisticado y robusto, un clásico neoyorquino.',
                ingredients: ['2.5 oz de Gin', '0.5 oz de Vermouth Seco', 'Aceituna verde'],
                instructions: 'PASO 1: Enfriar copa martini en congelador 10 minutos. PASO 2: Llenar mixing glass con hielo. PASO 3: Añadir 2.5 oz de gin, 0.5 oz de vermouth seco. PASO 4: Revolver con cuchara de bar 20 segundos. PASO 5: Colar en copa martini. PASO 6: Decorar con aceituna verde. CONSEJOS: Usa gin británico como Tanqueray o Gordon\'s. El vermouth seco debe estar muy frío. Menos vermouth es más seco. La aceituna debe estar en buen estado.',
                alcohol: 'gin',
                flavor: 'amargo',
                difficulty: 'medio',
                glass: 'martini',
                technique: 'revolver',
                occasion: 'clásico',
                time: '4 min',
                rating: 4.7,
                year: '1870',
                origin: 'EEUU'
            },
            {
                id: 'martini',
                name: 'Martini Seco',
                description: 'El rey de los cócteles, elegante y sofisticado.',
                ingredients: ['2.5 oz Gin', '0.5 oz Vermouth Seco', 'Aceituna verde'],
                instructions: 'PASO 1: Enfriar copa martini en congelador 10 minutos. PASO 2: Preparar espresso fresco y caliente. PASO 3: Llenar shaker con hielo. PASO 4: Añadir 2 oz vodka, 0.5 oz kahlúa, 1 oz espresso fresco, 0.5 oz jarabe de azúcar. PASO 5: Sacudir vigorosamente 15 segundos hasta bien frío. PASO 6: Colar en copa fría sin hielo. PASO 7: Decorar con 3 granos de café. CONSEJOS: Usa vodka de buena calidad como Absolut o Ketel One. El espresso debe estar fresco y caliente, no instantáneo. El kahlúa debe estar a temperatura ambiente. La espuma natural del espresso crea una textura especial.',
                alcohol: 'gin',
                flavor: 'amargo',
                difficulty: 'medio',
                glass: 'martini',
                technique: 'revolver',
                occasion: 'clásico',
                time: '3 min',
                rating: 4.9,
                year: '1880',
                origin: 'EEUU'
            },
            {
                id: 'pina-colada',
                name: 'Piña Colada',
                description: 'Tropical y cremoso, sabor del Caribe.',
                ingredients: ['2 oz Ron Blanco', '3 oz Piña', '1 oz Leche de coco'],
                instructions: 'PASO 1: Llenar shaker con hielo. PASO 2: Añadir 2 oz ron blanco, 3 oz jugo de piña fresco, 1 oz leche de coco. PASO 3: Sacudir vigorosamente 15 segundos hasta escarcha exterior. PASO 4: Colar en vaso highball con hielo fresco. PASO 5: Decorar con rodaja de piña y cereza. CONSEJOS: Usa ron blanco como Bacardi o Havana Club. El jugo de piña debe ser fresco, no enlatado. La leche de coco debe ser espesa y cremosa. Para versión más ligera, usa leche de coco light.',
                alcohol: 'ron',
                flavor: 'dulce',
                difficulty: 'fácil',
                glass: 'highball',
                technique: 'agitar',
                occasion: 'fiesta',
                time: '4 min',
                rating: 4.5,
                year: '1954',
                origin: 'Puerto Rico'
            },
            {
                id: 'whiskey-sour',
                name: 'Whiskey Sour',
                description: 'Balance perfecto entre dulce y ácido, clásico americano.',
                ingredients: ['2 oz Whisky Bourbon', '0.75 oz Limón fresco', '0.5 oz Azúcar', '1 clara de huevo'],
                instructions: 'PASO 1: Enfriar copa coupe en congelador 10 minutos. PASO 2: Llenar shaker con hielo. PASO 3: Añadir 2 oz whisky bourbon, 0.75 oz limón fresco, 0.5 oz azúcar, 1 clara de huevo. PASO 4: Sacudir vigorosamente 15 segundos hasta escarcha exterior. PASO 5: Colar en copa fría sin hielo. PASO 6: Decorar con cereza y naranja. CONSEJOS: Usa bourbon como Maker\'s Mark o Woodford Reserve. La clara de huevo debe estar fresca. Para versión sin clara, omítela y sirve con hielo. El azúcar debe ser jarabe 1:1 para mejor disolución.',
                alcohol: 'whisky',
                flavor: 'cítrico',
                difficulty: 'medio',
                glass: 'coupe',
                technique: 'agitar',
                occasion: 'clásico',
                time: '4 min',
                rating: 4.7,
                year: '1870',
                origin: 'EEUU'
            },
            {
                id: 'caipirinha',
                name: 'Caipirinha',
                description: 'El cóctel nacional de Brasil, refrescante y vibrante.',
                ingredients: ['2 oz de Cachaça', '1 oz de Lima', '2 cucharadas de azúcar', 'Menta fresca', 'Soda'],
                instructions: 'PASO 1: Cortar lima en 8 gajos. PASO 2: Colocar gajos en vaso old-fashioned. PASO 3: Añadir 2 cucharadas de azúcar. PASO 4: Macerar suavemente con muddler 5-6 veces. PASO 5: Llenar vaso con hielo. PASO 6: Añadir 2 oz de cachaça. PASO 7: Remover suavemente y servir. CONSEJOS: Usa cachaça brasileña como Leblon o Avuá. No machacar la lima demasiado - se vuelve amarga. El azúcar debe ser cristal. Sirve inmediatamente para mantener frescura.',
                alcohol: 'cachaça',
                flavor: 'cítrico',
                difficulty: 'fácil',
                glass: 'old-fashioned',
                technique: 'construir',
                occasion: 'fiesta',
                time: '4 min',
                rating: 4.3,
                year: '1917',
                origin: 'Brasil'
            },
            {
                id: 'moscow-mule',
                name: 'Moscow Mule',
                description: 'Picante y refrescante, servido en icónica copa de cobre.',
                ingredients: ['1.5 oz Vodka', '4 oz Ginger Beer', '0.5 oz Lima fresca'],
                instructions: 'PASO 1: Enfriar copa de cobre en congelador 5 minutos. PASO 2: Llenar copa con hielo. PASO 3: Añadir 1.5 oz vodka y 0.5 oz lima fresca. PASO 4: Completar con 4 oz ginger beer fría. PASO 5: Remover suavemente una vez. PASO 6: Decorar con rodaja de lima y jengibre. CONSEJOS: Usa vodka de buena calidad como Absolut o Ketel One. El ginger beer debe ser picante y real, no ginger ale. La copa de cobre mantiene la temperatura. Sirve muy frío.',
                alcohol: 'vodka',
                flavor: 'fresco',
                difficulty: 'fácil',
                glass: 'copa',
                technique: 'construir',
                occasion: 'fiesta',
                time: '3 min',
                rating: 4.4,
                year: '1941',
                origin: 'EEUU'
            },
            {
                id: 'sazerac',
                name: 'Sazerac',
                description: 'El cóctel oficial de Nueva Orleans, complejo y elegante.',
                ingredients: ['1 terrón de azúcar', '2 dashes de Peychaud\'s', '1 dash de absenta', 'cáscara de limón'],
                instructions: 'PASO 1: Enfriar copa old-fashioned con absenta: girar 1 dash de absenta, desechar. PASO 2: Llenar mixing glass con hielo. PASO 3: Añadir 2 oz de whisky rye, 1 terrón de azúcar, 2 dashes de Peychaud\'s. PASO 4: Revolver con cuchara de bar 30 segundos. PASO 5: Colar en copa preparada sin hielo. PASO 6: Expresar cáscara de limón sobre bebida y decorar. CONSEJOS: Usa whisky rye como Sazerac Rye. El Peychaud\'s es esencial, no sustituyas con Angostura. La absenta debe ser de buena calidad. La cáscara de limón debe ser exprimida sobre la bebida.',
                alcohol: 'whisky',
                flavor: 'herbal',
                difficulty: 'difícil',
                glass: 'old-fashioned',
                technique: 'revolver',
                occasion: 'clásico',
                time: '6 min',
                rating: 4.8,
                year: '1850',
                origin: 'EEUU'
            },
            {
                id: 'mai-tai',
                name: 'Mai Tai',
                description: 'Tropical polinesio, complejo balance de rones y licores.',
                ingredients: ['1 oz Ron Blanco', '1 oz Ron Oscuro', '0.5 oz Triple Sec', '0.5 oz Almendrado', '1 oz Lima', '0.5 oz Grenadine'],
                instructions: 'PASO 1: Llenar shaker con hielo. PASO 2: Añadir 1 oz ron blanco, 1 oz ron oscuro, 0.5 oz triple sec, 0.5 oz almendrado, 1 oz lima, 0.5 oz grenadine. PASO 3: Sacudir vigorosamente 15 segundos. PASO 4: Colar en vaso highball con hielo fresco. PASO 5: Decorar con piña y menta. CONSEJOS: Usa ron blanco ligero y ron oscuro envejecido. El almendrado debe ser orgeat. La grenadine debe ser real, no artificial. La proporción original es sagrada.',
                alcohol: 'ron',
                flavor: 'frutal',
                difficulty: 'medio',
                glass: 'highball',
                technique: 'agitar',
                occasion: 'fiesta',
                time: '5 min',
                rating: 4.5,
                year: '1944',
                origin: 'California'
            },
            {
                id: 'irish-coffee',
                name: 'Irish Coffee',
                description: 'Caliente y reconfortante, perfecto para climas fríos.',
                ingredients: ['1.5 oz Whisky Irish', '4 oz Café caliente', '1 cucharada azúcar', 'crema batida'],
                instructions: 'PASO 1: Calentar copa irish coffee con agua caliente. PASO 2: Preparar café fuerte y caliente. PASO 3: Añadir 1 cucharada azúcar a copa caliente. PASO 4: Añadir 1.5 oz whisky irish. PASO 5: Verter 4 oz café caliente. PASO 6: Flotar crema batida sobre el café. CONSEJOS: Usa whisky irish como Jameson o Bushmills. El café debe ser fuerte y sin filtrar. La crema debe estar fría y batida ligeramente. Vierte crema sobre cuchara para que flote.',
                alcohol: 'whisky',
                flavor: 'dulce',
                difficulty: 'fácil',
                glass: 'copa',
                technique: 'directo',
                occasion: 'digestivo',
                time: '4 min',
                rating: 4.3,
                year: '1940',
                origin: 'Irlanda'
            },
            {
                id: 'tom-collins',
                name: 'Tom Collins',
                description: 'Refrescante y burbujeante, versión mejorada del gin lemon.',
                ingredients: ['2 oz Gin', '1 oz Limón fresco', '0.5 oz Azúcar', '3 oz Soda'],
                instructions: 'PASO 1: Llenar shaker con hielo. PASO 2: Añadir 2 oz gin, 1 oz limón fresco, 0.5 oz azúcar. PASO 3: Sacudir 10 segundos. PASO 4: Colar en vaso highball con hielo fresco. PASO 5: Completar con 3 oz soda fría. PASO 6: Decorar con lima y cereza. CONSEJOS: Usa gin con notas cítricas como Beefeater. El azúcar debe ser jarabe 1:1. La soda debe estar bien fría. No sobre-llenes el vaso.',
                alcohol: 'gin',
                flavor: 'fresco',
                difficulty: 'fácil',
                glass: 'highball',
                technique: 'agitar',
                occasion: 'fiesta',
                time: '3 min',
                rating: 4.2,
                year: '1876',
                origin: 'Inglaterra'
            },
            {
                id: 'long-island',
                name: 'Long Island Iced Tea',
                description: 'Poderoso y refrescante, combinación de múltiples alcoholes.',
                ingredients: ['0.5 oz Vodka', '0.5 oz Gin', '0.5 oz Ron Blanco', '0.5 oz Tequila', '0.5 oz Triple Sec', '1 oz Limón', '2 oz Cola'],
                instructions: 'PASO 1: Llenar shaker con hielo. PASO 2: Añadir 0.5 oz vodka, 0.5 oz gin, 0.5 oz ron blanco, 0.5 oz tequila, 0.5 oz triple sec, 1 oz limón. PASO 3: Sacudir vigorosamente 15 segundos. PASO 4: Colar en vaso highball con hielo fresco. PASO 5: Completar con 2 oz cola. PASO 6: Decorar con lima. CONSEJOS: Usa alcoholes de buena calidad. La cola debe estar fría. No agites demasiado - se diluye. La proporción es clave para balance.',
                alcohol: 'vodka',
                flavor: 'cítrico',
                difficulty: 'medio',
                glass: 'highball',
                technique: 'agitar',
                occasion: 'fiesta',
                time: '4 min',
                rating: 4.1,
                year: '1970',
                origin: 'EEUU'
            },
            {
                id: 'mimosa',
                name: 'Mimosa',
                description: 'Elegante y ligero, perfecto para brunch y celebraciones.',
                ingredients: ['3 oz Champagne', '3 oz Jugo de naranja'],
                instructions: 'PASO 1: Enfriar copa flauta en congelador 5 minutos. PASO 2: Verter 3 oz champagne bien frío. PASO 3: Añadir 3 oz jugo de naranja fresco. PASO 4: Remover suavemente una vez. PASO 5: Servir inmediatamente muy frío. CONSEJOS: Usa champagne o prosecco seco. El jugo debe ser fresco y sin pulpa. La proporción 1:1 es clásica. Sirve inmediatamente para mantener burbujas.',
                alcohol: 'liqueur',
                flavor: 'fresco',
                difficulty: 'fácil',
                glass: 'copa',
                technique: 'directo',
                occasion: 'romántico',
                time: '2 min',
                rating: 4.0,
                year: '1925',
                origin: 'Francia'
            },
            {
                id: 'bloody-mary',
                name: 'Bloody Mary',
                description: 'Picante y sabroso, clásico del desayuno y cura de resacas.',
                ingredients: ['1.5 oz Vodka', '3 oz Jugo de tomate', '0.5 oz Jugo de limón', 'Salsa Worcestershire', 'Tabasco', 'sal', 'pimienta', 'apio'],
                instructions: 'Mezclar vodka, jugo de tomate, jugo de limón, Worcestershire y Tabasco. Servir en vaso highball con hielo. Decorar con apio.',
                alcohol: 'vodka',
                flavor: 'especiado',
                difficulty: 'medio',
                glass: 'highball',
                technique: 'mezclar',
                occasion: 'aperitivo',
                time: '5 min',
                rating: 4.3,
                year: '1921',
                origin: 'París'
            },
            {
                id: 'white-russian',
                name: 'White Russian',
                description: 'Cremoso y potente, icónico de la cultura pop.',
                ingredients: ['2 oz Vodka', '1 oz Kahlúa', '1 oz Crema'],
                instructions: 'Verter vodka y Kahlúa en vaso old-fashioned con hielo. Flotar crema sobre la bebida. Servir sin revolver.',
                alcohol: 'vodka',
                flavor: 'cremoso',
                difficulty: 'fácil',
                glass: 'old-fashioned',
                technique: 'directo',
                occasion: 'digestivo',
                time: '3 min',
                rating: 4.4,
                year: '1960',
                origin: 'Bélgica'
            },
            {
                id: 'dark-n-stormy',
                name: 'Dark \'n\' Stormy',
                description: 'Picante y complejo, combinación perfecta de ron y ginger.',
                ingredients: ['2 oz Ron Oscuro', '4 oz Ginger Beer', '0.5 oz Lima'],
                instructions: 'Llenar vaso highball con hielo. Agregar ron oscuro y jugo de lima. Completar con ginger beer. Decorar con lima.',
                alcohol: 'ron',
                flavor: 'especiado',
                difficulty: 'fácil',
                glass: 'highball',
                technique: 'construir',
                occasion: 'fiesta',
                time: '3 min',
                rating: 4.5,
                year: '1970',
                origin: 'Bermudas'
            },
            {
                id: 'french-75',
                name: 'French 75',
                description: 'Elegante y burbujeante, combina gin con champagne.',
                ingredients: ['1 oz Gin', '0.5 oz Limón fresco', '0.5 oz Azúcar', '3 oz Champagne'],
                instructions: 'Sacudir gin, jugo de limón y azúcar con hielo. Colar en copa flauta. Completar con champagne. Decorar con lima.',
                alcohol: 'gin',
                flavor: 'fresco',
                difficulty: 'medio',
                glass: 'copa',
                technique: 'agitar',
                occasion: 'romántico',
                time: '4 min',
                rating: 4.6,
                year: '1915',
                origin: 'Francia'
            },
            {
                id: 'old-cuban',
                name: 'Old Cuban',
                description: 'Sophisticado y complejo, versión moderna del daiquiri creado por el bartender cubano Julio Cabrera.',
                ingredients: ['2 oz Ron Añejo', '0.75 oz Lima', '0.5 oz Azúcar', '2 dashes Angostura', 'Champagne'],
                instructions: 'Sacudir ron, lima, azúcar y Angostura con hielo. Colar en copa coupe. Completar con champagne. Decorar con lima.',
                alcohol: 'ron',
                flavor: 'cítrico',
                difficulty: 'difícil',
                glass: 'copa',
                technique: 'agitar',
                occasion: 'romántico',
                time: '5 min',
                rating: 4.7,
                year: '2000',
                origin: 'Cuba'
            },
            {
                id: 'amaretto-sour',
                name: 'Amaretto Sour',
                description: 'Dulce y ácido con un toque almendrado, creado en Italia y popularizado en Chicago.',
                ingredients: ['2 oz Bourbon', '0.75 oz Amaretto', '0.75 oz Limón fresco', '0.5 oz Azúcar', '1 clara de huevo'],
                instructions: 'Sacudir bourbon, amaretto, jugo de limón, azúcar y clara de huevo con hielo. Colar en copa coupe. Decorar con cereza.',
                alcohol: 'whisky',
                flavor: 'dulce',
                difficulty: 'medio',
                glass: 'coupe',
                technique: 'agitar',
                occasion: 'digestivo',
                time: '4 min',
                rating: 4.4,
                year: '1970',
                origin: 'Italia'
            },
            {
                id: 'grasshopper',
                name: 'Grasshopper',
                description: 'Cremoso y dulce con menta fresca, creado en Nueva Orleans en homenaje a los saltamontes.',
                ingredients: ['1 oz Creme de Menthe', '1 oz Creme de Cacao', '1 oz Crema'],
                instructions: 'Mezclar creme de menthe, creme de cacao y crema con hielo. Colar en copa coupe. Decorar con hoja de menta.',
                alcohol: 'liqueur',
                flavor: 'cremoso',
                difficulty: 'fácil',
                glass: 'coupe',
                technique: 'mezclar',
                occasion: 'digestivo',
                time: '3 min',
                rating: 4.2,
                year: '1919',
                origin: 'EEUU'
            },
            {
                id: 'sidecar',
                name: 'Sidecar',
                description: 'Clásico francés con brandy y naranja, creado durante la Primera Guerra Mundial.',
                ingredients: ['2 oz Cognac', '0.75 oz Triple Sec', '0.75 oz Naranja fresca'],
                instructions: 'Sacudir cognac, triple sec y jugo de naranja con hielo. Colar en copa coupe con borde de azúcar. Decorar con cáscara de naranja.',
                alcohol: 'brandy',
                flavor: 'cítrico',
                difficulty: 'fácil',
                glass: 'copa',
                technique: 'agitar',
                occasion: 'clásico',
                time: '3 min',
                rating: 4.6,
                year: '1922',
                origin: 'Francia'
            },
            {
                id: 'aviation',
                name: 'Aviation',
                description: 'Elegante y floral con violetas, creado por Hugo Ensslin en Nueva York.',
                ingredients: ['2 oz Gin', '0.5 oz Maraschino Liqueur', '0.25 oz Creme de Violette', '0.75 oz Limón fresco'],
                instructions: 'Sacudir gin, maraschino, creme de violette y jugo de limón con hielo. Colar en copa coupe. Decorar con cereza.',
                alcohol: 'gin',
                flavor: 'herbal',
                difficulty: 'medio',
                glass: 'copa',
                technique: 'agitar',
                occasion: 'romántico',
                time: '4 min',
                rating: 4.5,
                year: '1916',
                origin: 'EEUU'
            },
            {
                id: 'godfather',
                name: 'Godfather',
                description: 'Simple pero sofisticado, creado en homenaje a la película mafiosa.',
                ingredients: ['1.5 oz Scotch Whisky', '0.75 oz Amaretto'],
                instructions: 'Verter scotch y amaretto en vaso old-fashioned con hielo. Revolver suavemente. Servir con hielo.',
                alcohol: 'whisky',
                flavor: 'dulce',
                difficulty: 'fácil',
                glass: 'old-fashioned',
                technique: 'construir',
                occasion: 'digestivo',
                time: '2 min',
                rating: 4.3,
                year: '1970',
                origin: 'EEUU'
            },
            {
                id: 'b-52',
                name: 'B-52',
                description: 'Capas espectaculares de café, crema y naranja, creado en Alberta, Canadá.',
                ingredients: ['0.5 oz Kahlúa', '0.5 oz Baileys', '0.5 oz Grand Marnier'],
                instructions: 'Verter kahlúa en vaso shot. Añadir baileys cuidadosamente sobre kahlúa. Completar con grand marnier. Servir sin revolver.',
                alcohol: 'liqueur',
                flavor: 'dulce',
                difficulty: 'fácil',
                glass: 'shot',
                technique: 'directo',
                occasion: 'fiesta',
                time: '2 min',
                rating: 4.1,
                year: '1977',
                origin: 'Canadá'
            },
            {
                id: 'penicillin',
                name: 'Penicillin',
                description: 'Moderno clásico con jengibre y whisky, creado por Sam Ross en Nueva York.',
                ingredients: ['2 oz Scotch Whisky', '0.75 oz Jugo de limón', '0.5 oz Jengibre', '0.25 oz Islay Scotch'],
                instructions: 'Sacudir scotch, jugo de limón y jarabe de jengibre con hielo. Colar en copa old-fashioned. Flotar scotch islay. Decorar con jengibre.',
                alcohol: 'whisky',
                flavor: 'especiado',
                difficulty: 'medio',
                glass: 'old-fashioned',
                technique: 'agitar',
                occasion: 'clásico',
                time: '4 min',
                rating: 4.6,
                year: '2005',
                origin: 'EEUU'
            },
            {
                id: 'clover-club',
                name: 'Clover Club',
                description: 'Clásico de Filadelfia con lima y frambuesa, creado antes de la Ley Seca.',
                ingredients: ['2 oz Gin', '0.75 oz Limón fresco', '0.5 oz Jarabe de frambuesa', '1 clara de huevo'],
                instructions: 'Sacudir gin, jugo de limón, jarabe de frambuesa y clara de huevo con hielo. Colar en copa coupe. Decorar con frambuesa.',
                alcohol: 'gin',
                flavor: 'frutal',
                difficulty: 'medio',
                glass: 'copa',
                technique: 'agitar',
                occasion: 'romántico',
                time: '4 min',
                rating: 4.7,
                year: '1896',
                origin: 'EEUU'
            },
            {
                id: 'last-word',
                name: 'Last Word',
                description: 'Equilibrio perfecto de gin, maraschino y lima, creado en Detroit antes de la Ley Seca.',
                ingredients: ['0.75 oz Gin', '0.75 oz Maraschino Liqueur', '0.75 oz Green Chartreuse', '0.75 oz Limón fresco'],
                instructions: 'Sacudir todos los ingredientes con hielo. Colar en copa coupe. Decorar con cereza.',
                alcohol: 'gin',
                flavor: 'herbal',
                difficulty: 'medio',
                glass: 'copa',
                technique: 'agitar',
                occasion: 'clásico',
                time: '4 min',
                rating: 4.8,
                year: '1915',
                origin: 'EEUU'
            },
            {
                id: 'boulevardier',
                name: 'Boulevardier',
                description: 'Variación del Negroni con whisky, creado por Harry McElhone en París.',
                ingredients: ['1.5 oz Whisky Bourbon', '1 oz Campari', '1 oz Vermouth Rojo'],
                instructions: 'Enfriar copa old-fashioned. Agregar hielo, bourbon, campari y vermut. Revolver suavemente. Decorar con cáscara de naranja.',
                alcohol: 'whisky',
                flavor: 'amargo',
                difficulty: 'medio',
                glass: 'old-fashioned',
                technique: 'revolver',
                occasion: 'aperitivo',
                time: '5 min',
                rating: 4.6,
                year: '1927',
                origin: 'Francia'
            },
            {
                id: 'royal-courier',
                name: 'Royal Courier',
                description: 'Variación del Sidecar con brandy y champagne, creado en Londres.',
                ingredients: ['1.5 oz Cognac', '0.5 oz Triple Sec', '0.5 oz Limón fresco', 'Champagne'],
                instructions: 'Sacudir cognac, triple sec y jugo de limón con hielo. Colar en copa coupe. Completar con champagne. Decorar con lima.',
                alcohol: 'brandy',
                flavor: 'cítrico',
                difficulty: 'medio',
                glass: 'copa',
                technique: 'agitar',
                occasion: 'romántico',
                time: '4 min',
                rating: 4.5,
                year: '1930',
                origin: 'Inglaterra'
            },
            {
                id: 'zombie',
                name: 'Zombie',
                description: 'Potente cóctel tropical con múltiples rones, creado por Donn Beach en Hollywood.',
                ingredients: ['1 oz Ron Blanco', '1 oz Ron Dorado', '1 oz Ron Oscuro', '0.5 oz Apricot Brandy', '1 oz Lima', '0.5 oz Grenadine', '0.5 oz Falernum', 'Dash de Angostura'],
                instructions: 'Sacudir todos los ingredientes excepto angostura con hielo. Colar en vaso highball. Añadir dash de angostura. Decorar con piña.',
                alcohol: 'ron',
                flavor: 'frutal',
                difficulty: 'difícil',
                glass: 'highball',
                technique: 'agitar',
                occasion: 'fiesta',
                time: '6 min',
                rating: 4.4,
                year: '1934',
                origin: 'EEUU'
            },
            {
                id: 'pisco-sour',
                name: 'Pisco Sour',
                description: 'Cóctel nacional de Perú con pisco, creado por Victor Morris en Lima.',
                ingredients: ['2 oz Pisco', '1 oz Lima fresca', '0.75 oz Azúcar', '1 clara de huevo', 'Dash de Angostura'],
                instructions: 'Sacudir pisco, jugo de lima, azúcar y clara de huevo con hielo. Colar en copa coupe. Añadir dash de angostura. Decorar con lima.',
                alcohol: 'pisco',
                flavor: 'cítrico',
                difficulty: 'medio',
                glass: 'copa',
                technique: 'agitar',
                occasion: 'aperitivo',
                time: '4 min',
                rating: 4.6,
                year: '1920',
                origin: 'Perú'
            },
            {
                id: 'aperol-spritz',
                name: 'Aperol Spritz',
                description: 'Refrescante italiano con Aperol y prosecco, popular en Venecia.',
                ingredients: ['3 oz Prosecco', '2 oz Aperol', '1 oz Soda', 'Naranja'],
                instructions: 'Llenar vaso wine con hielo. Agregar prosecco y aperol. Completar con soda. Revolver suavemente. Decorar con naranja.',
                alcohol: 'liqueur',
                flavor: 'fresco',
                difficulty: 'fácil',
                glass: 'copa',
                technique: 'construir',
                occasion: 'aperitivo',
                time: '3 min',
                rating: 4.3,
                year: '1950',
                origin: 'Italia'
            },
            {
                id: 'paloma',
                name: 'Paloma',
                description: 'Cóctel mexicano con tequila y grapefruit, el más popular de México.',
                ingredients: ['2 oz Tequila Blanco', '0.5 oz Lima', 'Grapefruit Soda', 'Sal'],
                instructions: 'PASO 1: Preparar borde de sal: humedecer borde de vaso highball con lima, sumergir en sal gruesa. PASO 2: Llenar vaso con hielo fresco. PASO 3: Añadir 2 oz tequila blanco. PASO 4: Añadir 0.5 oz jugo de lima fresco. PASO 5: Completar con grapefruit soda bien fría. PASO 6: Remover suavemente una vez. PASO 7: Decorar con rodaja de lima. CONSEJOS: Usa tequila blanco 100% agave como Don Julio o Patron. El grapefruit soda debe ser Squirt o Jarritos para autenticidad. La sal debe ser marina gruesa. Sirve inmediatamente para mantener carbonatación.',
                alcohol: 'tequila',
                flavor: 'cítrico',
                difficulty: 'fácil',
                glass: 'highball',
                technique: 'construir',
                occasion: 'fiesta',
                time: '3 min',
                rating: 4.5,
                year: '1950',
                origin: 'México'
            },
            {
                id: 'espresso-martini',
                name: 'Espresso Martini',
                description: 'Moderno clásico con café y vodka, creado por Dick Bradsell en Londres.',
                ingredients: ['2 oz Vodka', '0.5 oz Kahlúa', '1 oz Espresso fresco', '0.5 oz Azúcar'],
                instructions: 'PASO 1: Enfriar copa martini en congelador 10 minutos. PASO 2: Preparar espresso fresco y caliente. PASO 3: Llenar shaker con hielo. PASO 4: Añadir 2 oz vodka, 0.5 oz kahlúa, 1 oz espresso fresco, 0.5 oz jarabe de azúcar. PASO 5: Sacudir vigorosamente 15 segundos hasta bien frío. PASO 6: Colar en copa fría sin hielo. PASO 7: Decorar con 3 granos de café. CONSEJOS: Usa vodka de buena calidad como Absolut o Ketel One. El espresso debe estar fresco y caliente, no instantáneo. El kahlúa debe estar a temperatura ambiente. La espuma natural del espresso crea una textura especial.',
                alcohol: 'vodka',
                flavor: 'dulce',
                difficulty: 'medio',
                glass: 'martini',
                technique: 'agitar',
                occasion: 'digestivo',
                time: '4 min',
                rating: 4.4,
                year: '1983',
                origin: 'Inglaterra'
            },
            {
                id: 'negroni-sbagliato',
                name: 'Negroni Sbagliato',
                description: 'Variación del Negroni con prosecco, creado por error en Milán.',
                ingredients: ['1 oz Gin', '1 oz Campari', '1 oz Vermouth Rojo', 'Prosecco'],
                instructions: 'PASO 1: Enfriar copa old-fashioned llenándola con hielo y agua por 30 segundos. PASO 2: Desechar el agua y agregar hielo fresco. PASO 3: Añadir 1 oz gin, 1 oz campari, 1 oz vermut rojo. PASO 4: Revolver suavemente con cuchara de bar 20 segundos. PASO 5: Colar en copa fría sin hielo. PASO 6: Completar con prosecco bien frío. PASO 7: Decorar con cáscara de naranja. CONSEJOS: Usa gin italiano como Tanqueray o Bombay Sapphire. El prosecco debe estar bien frío y seco. El vermut rojo debe estar refrigerado. El nombre sbagliato significa "equivocado" en italiano.',
                alcohol: 'gin',
                flavor: 'amargo',
                difficulty: 'fácil',
                glass: 'old-fashioned',
                technique: 'construir',
                occasion: 'aperitivo',
                time: '4 min',
                rating: 4.5,
                year: '1960',
                origin: 'Italia'
            },
            {
                id: 'black-russian',
                name: 'Black Russian',
                description: 'Simple pero potente, creado en Bruselas en honor a embajadores americanos.',
                ingredients: ['2 oz Vodka', '1 oz Kahlúa'],
                instructions: 'PASO 1: Llenar vaso old-fashioned con hielo grande. PASO 2: Añadir 2 oz vodka. PASO 3: Añadir 1 oz kahlúa. PASO 4: Revolver suavemente con cuchara de bar 15 segundos. PASO 5: Servir con hielo fresco. CONSEJOS: Usa vodka de buena calidad como Absolut o Smirnoff. El kahlúa debe estar a temperatura ambiente. No agregar crema - eso sería un White Russian. La proporción 2:1 es clásica.',
                alcohol: 'vodka',
                flavor: 'dulce',
                difficulty: 'fácil',
                glass: 'old-fashioned',
                technique: 'construir',
                occasion: 'digestivo',
                time: '2 min',
                rating: 4.2,
                year: '1949',
                origin: 'Bélgica'
            },
            {
                id: 'rusty-nail',
                name: 'Rusty Nail',
                description: 'Clásico escocés con Drambuie, creado en honor a los soldados británicos.',
                ingredients: ['2 oz Scotch Whisky', '0.5 oz Drambuie'],
                instructions: 'PASO 1: Llenar vaso old-fashioned con hielo grande. PASO 2: Añadir 2 oz scotch whisky. PASO 3: Añadir 0.5 oz drambuie. PASO 4: Revolver suavemente con cuchara de bar 15 segundos. PASO 5: Servir con hielo fresco. CONSEJOS: Usa scotch blended como Johnnie Walker Black Label. El drambuie es un licor de whisky con miel. No usar hielo triturado. La proporción 4:1 scotch:drambuie es tradicional.',
                alcohol: 'whisky',
                flavor: 'dulce',
                difficulty: 'fácil',
                glass: 'old-fashioned',
                technique: 'construir',
                occasion: 'digestivo',
                time: '2 min',
                rating: 4.3,
                year: '1960',
                origin: 'Escocia'
            },
            {
                id: 'vesper',
                name: 'Vesper',
                description: 'Elegante creación de James Bond, creada por Ian Fleming en Montecarlo.',
                ingredients: ['1.5 oz Gin', '0.5 oz Vodka', '0.25 oz Lillet Blanc', 'Cáscara de limón'],
                instructions: 'PASO 1: Enfriar copa martini en congelador 10 minutos. PASO 2: Llenar shaker con hielo. PASO 3: Añadir 1.5 oz gin, 0.5 oz vodka, 0.25 oz lillet blanc. PASO 4: Sacudir vigorosamente 15 segundos hasta escarcha exterior. PASO 5: Colar en copa fría sin hielo. PASO 6: Expresar cáscara de limón sobre bebida y decorar. CONSEJOS: Usa gin británico como Gordon\'s y vodka ruso como Stolichnaya. El lillet blanc debe estar refrigerado. Esta es la receta original de James Bond, no la versión moderna.',
                alcohol: 'gin',
                flavor: 'cítrico',
                difficulty: 'medio',
                glass: 'martini',
                technique: 'agitar',
                occasion: 'romántico',
                time: '4 min',
                rating: 4.7,
                year: '1953',
                origin: 'Montecarlo'
            },
            {
                id: 'between-the-sheets',
                name: 'Between the Sheets',
                description: 'Variación del Sidecar con ron, creado en París entre las guerras.',
                ingredients: ['1 oz Ron Blanco', '1 oz Cognac', '0.75 oz Triple Sec', '0.75 oz Lima'],
                instructions: 'PASO 1: Enfriar copa coupe en congelador 10 minutos. PASO 2: Llenar shaker con hielo. PASO 3: Añadir 1 oz ron blanco, 1 oz cognac, 0.75 oz triple sec, 0.75 oz lima fresca. PASO 4: Sacudir vigorosamente 12-15 segundos. PASO 5: Colar en copa fría sin hielo. PASO 6: Decorar con rodaja de lima. CONSEJOS: Usa ron blanco cubano como Havana Club y cognac VS como Martell. El triple sec debe ser de buena calidad como Cointreau. La lima debe estar fresca y exprimida al momento. Este cóctel es más fuerte que un Sidecar tradicional.',
                alcohol: 'ron',
                flavor: 'cítrico',
                difficulty: 'fácil',
                glass: 'copa',
                technique: 'agitar',
                occasion: 'romántico',
                time: '3 min',
                rating: 4.4,
                year: '1930',
                origin: 'Francia'
            },
            {
                id: 'mary-pickford',
                name: 'Mary Pickford',
                description: 'Dulce y tropical, creado en honor a la actriz muda en Cuba.',
                ingredients: ['2 oz Ron Blanco', '0.5 oz Grenadine', '0.5 oz Lima', 'Pineapple Juice'],
                instructions: 'PASO 1: Enfriar copa coupe en congelador 10 minutos. PASO 2: Llenar shaker con hielo. PASO 3: Añadir 2 oz ron blanco, 0.5 oz grenadine, 0.5 oz lima fresca, 1 oz jugo de piña. PASO 4: Sacudir vigorosamente 12 segundos. PASO 5: Colar en copa fría sin hielo. PASO 6: Decorar con rodaja de piña y cereza. CONSEJOS: Usa ron blanco ligero como Bacardi. La grenadine debe ser real, no artificial. El jugo de piña debe ser fresco, no enlatado. Creado en el Hotel Nacional de Cuba en honor a la actriz.',
                alcohol: 'ron',
                flavor: 'dulce',
                difficulty: 'fácil',
                glass: 'copa',
                technique: 'agitar',
                occasion: 'fiesta',
                time: '3 min',
                rating: 4.3,
                year: '1920',
                origin: 'Cuba'
            },
            {
                id: 'jack-rose',
                name: 'Jack Rose',
                description: 'Clásico americano con manzana y applejack, mencionado por Hemingway.',
                ingredients: ['2 oz Applejack', '0.75 oz Grenadine', '0.75 oz Lima'],
                instructions: 'PASO 1: Enfriar copa coupe en congelador 10 minutos. PASO 2: Llenar shaker con hielo. PASO 3: Añadir 2 oz applejack, 0.75 oz grenadine, 0.75 oz lima fresca. PASO 4: Sacudir vigorosamente 12 segundos. PASO 5: Colar en copa fría sin hielo. PASO 6: Decorar con rodaja de manzana. CONSEJOS: Usa applejack como Laird\'s Bonded o Applejack 86. La grenadine debe ser real, no rojo artificial. La lima debe estar fresca. Este cóctel es mencionado en "The Sun Also Rises" de Hemingway.',
                alcohol: 'brandy',
                flavor: 'dulce',
                difficulty: 'fácil',
                glass: 'copa',
                technique: 'agitar',
                occasion: 'clásico',
                time: '3 min',
                rating: 4.2,
                year: '1905',
                origin: 'EEUU'
            },
            {
                id: 'brown-derby',
                name: 'Brown Derby',
                description: 'Clásico de Hollywood con bourbon y grapefruit, creado en el Derby de Kentucky.',
                ingredients: ['2 oz Bourbon', '0.5 oz Grapefruit', '0.5 oz Honey Syrup'],
                instructions: 'PASO 1: Enfriar copa coupe en congelador 10 minutos. PASO 2: Preparar jarabe de miel 1:1 miel:agua caliente. PASO 3: Llenar shaker con hielo. PASO 4: Añadir 2 oz bourbon, 0.5 oz jugo de grapefruit fresco, 0.5 oz jarabe de miel. PASO 5: Sacudir vigorosamente 12 segundos. PASO 6: Colar en copa fría sin hielo. PASO 7: Decorar con cáscara de grapefruit. CONSEJOS: Usa bourbon como Woodford Reserve o Buffalo Trace. El grapefruit debe estar fresco y exprimido. El jarabe de miel debe estar bien disuelto. Creado en el restaurante Brown Derby de Hollywood.',
                alcohol: 'whisky',
                flavor: 'dulce',
                difficulty: 'fácil',
                glass: 'copa',
                technique: 'agitar',
                occasion: 'clásico',
                time: '3 min',
                rating: 4.3,
                year: '1930',
                origin: 'EEUU'
            },
            {
                id: 'gold-rush',
                name: 'Gold Rush',
                description: 'Moderno clásico con bourbon y miel, creado en Nueva York.',
                ingredients: ['2 oz Bourbon', '0.75 oz Honey Syrup', '0.75 oz Lima'],
                instructions: 'PASO 1: Enfriar copa coupe en congelador 10 minutos. PASO 2: Preparar jarabe de miel 1:1 miel:agua caliente. PASO 3: Llenar shaker con hielo. PASO 4: Añadir 2 oz bourbon, 0.75 oz jarabe de miel, 0.75 oz lima fresca. PASO 5: Sacudir vigorosamente 12 segundos. PASO 6: Colar en copa fría sin hielo. PASO 7: Decorar con rodaja de lima. CONSEJOS: Usa bourbon como Maker\'s Mark o Eagle Rare. La miel debe ser de buena calidad, preferiblemente silvestre. La lima debe estar fresca. Creado en Milk & Honey en Nueva York por T.J. Siegal.',
                alcohol: 'whisky',
                flavor: 'dulce',
                difficulty: 'fácil',
                glass: 'copa',
                technique: 'agitar',
                occasion: 'digestivo',
                time: '3 min',
                rating: 4.5,
                year: '2000',
                origin: 'EEUU'
            },
            {
                id: 'paper-plane',
                name: 'Paper Plane',
                description: 'Moderno clásico con bourbon y amaro, creado en Chicago.',
                ingredients: ['1 oz Bourbon', '0.75 oz Aperol', '0.75 oz Amaro Nonino', '0.75 oz Lima'],
                instructions: 'PASO 1: Enfriar copa coupe en congelador 10 minutos. PASO 2: Llenar shaker con hielo. PASO 3: Añadir 1 oz bourbon, 0.75 oz aperol, 0.75 oz amaro nonino, 0.75 oz lima fresca. PASO 4: Sacudir vigorosamente 15 segundos. PASO 5: Colar en copa fría sin hielo. PASO 6: Decorar con rodaja de lima. CONSEJOS: Usa bourbon como Four Roses Small Batch. El aperol debe estar frío. El amaro nonino es esencial, no sustituyas. La lima debe estar fresca. Creado en Chicago por Sam Ross en 2007.',
                alcohol: 'whisky',
                flavor: 'amargo',
                difficulty: 'medio',
                glass: 'copa',
                technique: 'agitar',
                occasion: 'aperitivo',
                time: '4 min',
                rating: 4.6,
                year: '2008',
                origin: 'EEUU'
            },
            {
                id: 'smoky-martini',
                name: 'Smoky Martini',
                description: 'Variación ahumada del martini clásico, creado en bares modernos.',
                ingredients: ['2.5 oz Gin', '0.5 oz Vermouth Seco', 'Aceituna ahumada'],
                instructions: 'Ahumar gin con ramita de romero. Enfriar vaso martini. Agregar gin y vermouth. Revolver con hielo. Colar. Decorar con aceituna ahumada.',
                alcohol: 'gin',
                flavor: 'amargo',
                difficulty: 'medio',
                glass: 'martini',
                technique: 'revolver',
                occasion: 'clásico',
                time: '4 min',
                rating: 4.7,
                year: '2010',
                origin: 'Moderno'
            },
            {
                id: 'brazilian-wax',
                name: 'Brazilian Wax',
                description: 'Tropical con cachaça y frutas exóticas, creado en San Pablo.',
                ingredients: ['2 oz Cachaça', '1 oz Passion Fruit', '0.5 oz Lima', '0.5 oz Azúcar', 'Hojas de hierba buena'],
                instructions: 'Sacudir cachaça, jugo de maracuyá, lima y azúcar con hielo. Colar en copa coupe. Decorar con hierba buena.',
                alcohol: 'brandy',
                flavor: 'frutal',
                difficulty: 'medio',
                glass: 'copa',
                technique: 'agitar',
                occasion: 'fiesta',
                time: '4 min',
                rating: 4.5,
                year: '2015',
                origin: 'Brasil'
            },
            {
                id: 'tokyo-highball',
                name: 'Tokyo Highball',
                description: 'Refinado highball japonés con gin y soda, creado en Tokio.',
                ingredients: ['2 oz Japanese Gin', '4 oz Soda', '1 dash Angostura', 'Cáscara de pomelo'],
                instructions: 'Llenar vaso highball con hielo. Agregar gin y angostura. Completar con soda. Decorar con cáscara de pomelo.',
                alcohol: 'gin',
                flavor: 'fresco',
                difficulty: 'fácil',
                glass: 'highball',
                technique: 'construir',
                occasion: 'aperitivo',
                time: '2 min',
                rating: 4.6,
                year: '2012',
                origin: 'Japón'
            },
            {
                id: 'mexican-firing-squad',
                name: 'Mexican Firing Squad',
                description: 'Complejo cóctel mexicano con tequila y granada, creado en Ciudad de México.',
                ingredients: ['2 oz Tequila', '0.75 oz Grenadine', '0.75 oz Lima', '0.5 oz Amargo Angostura', 'Soda'],
                instructions: 'Sacudir tequila, grenadine, lima y angostura con hielo. Colar en vaso highball. Completar con soda. Decorar con lima.',
                alcohol: 'tequila',
                flavor: 'dulce',
                difficulty: 'medio',
                glass: 'highball',
                technique: 'agitar',
                occasion: 'fiesta',
                time: '5 min',
                rating: 4.4,
                year: '1930',
                origin: 'México'
            },
            {
                id: 'singapore-sling',
                name: 'Singapore Sling',
                description: 'Complejo cóctel tropical creado en Singapur con gin y frutas.',
                ingredients: ['1.5 oz Gin', '0.5 oz Cherry Brandy', '0.25 oz Triple Sec', '4 oz Pineapple', '0.5 oz Lime', '0.5 oz Grenadine', 'Bitter'],
                instructions: 'Sacudir gin, cherry brandy, triple sec, piña, lima y grenadine con hielo. Colar en vaso highball. Añadir bitter. Decorar con piña.',
                alcohol: 'gin',
                flavor: 'frutal',
                difficulty: 'difícil',
                glass: 'highball',
                technique: 'agitar',
                occasion: 'fiesta',
                time: '6 min',
                rating: 4.5,
                year: '1915',
                origin: 'Singapur'
            },
            {
                id: 'mai-tai-upgraded',
                name: 'Mai Tai Upgraded',
                description: 'Versión moderna del clásico tropical con rones premium y frutas frescas.',
                ingredients: ['1.5 oz Ron Añejo', '0.5 oz Ron Blanco', '0.5 oz Orange Curaçao', '0.5 oz Orgeat', '1 oz Lima', '0.5 oz Grenadine', 'Menta'],
                instructions: 'Sacudir rones, curacao, orgeat, lima y grenadine con hielo. Colar en copa tiki. Decorar con menta y piña.',
                alcohol: 'ron',
                flavor: 'frutal',
                difficulty: 'medio',
                glass: 'copa',
                technique: 'agitar',
                occasion: 'fiesta',
                time: '5 min',
                rating: 4.8,
                year: '2020',
                origin: 'Moderno'
            },
            {
                id: 'royal-blood',
                name: 'Royal Blood',
                description: 'Elegante cóctel con champagne y berries, creado para bodas reales.',
                ingredients: ['1 oz Chambord', '0.5 oz Vodka', '0.5 oz Lima', 'Champagne', 'Frambuesas'],
                instructions: 'Sacudir chambord, vodka y lima con hielo. Colar en copa flauta. Completar con champagne. Decorar con frambruesas.',
                alcohol: 'liqueur',
                flavor: 'frutal',
                difficulty: 'fácil',
                glass: 'copa',
                technique: 'agitar',
                occasion: 'romántico',
                time: '3 min',
                rating: 4.6,
                year: '2018',
                origin: 'Inglaterra'
            },
            {
                id: 'smoky-rose',
                name: 'Smoky Rose',
                description: 'Moderno cóctel con whisky ahumado y rosas, creado en Nueva York.',
                ingredients: ['2 oz Smoked Whisky', '0.75 oz Rose Syrup', '0.75 oz Lima', 'Pétalos de rosa', 'Ahumado'],
                instructions: 'Ahumar whisky con pétalos de rosa. Sacudir whisky, jarabe de rosa y lima con hielo. Colar en copa coupe. Decorar con pétalos.',
                alcohol: 'whisky',
                flavor: 'floral',
                difficulty: 'medio',
                glass: 'copa',
                technique: 'agitar',
                occasion: 'romántico',
                time: '4 min',
                rating: 4.7,
                year: '2019',
                origin: 'EEUU'
            },
            {
                id: 'golden-gate',
                name: 'Golden Gate',
                description: 'Cóctel californiano con gin y cítricos, inspirado en el puente de San Francisco.',
                ingredients: ['2 oz California Gin', '0.75 oz Grapefruit', '0.5 oz Orange', '0.5 oz Honey', 'Sal marina'],
                instructions: 'Sacudir gin, grapefruit, naranja y miel con hielo. Colar en copa coupe. Decorar con sal marina.',
                alcohol: 'gin',
                flavor: 'cítrico',
                difficulty: 'medio',
                glass: 'copa',
                technique: 'agitar',
                occasion: 'aperitivo',
                time: '4 min',
                rating: 4.5,
                year: '2017',
                origin: 'EEUU'
            },
            {
                id: 'midnight-sun',
                name: 'Midnight Sun',
                description: 'Cóctel nórdico con aquavit y bayas, inspirado en el sol de medianoche.',
                ingredients: ['2 oz Aquavit', '0.75 oz Lingonberry', '0.5 oz Lime', '0.5 oz Honey', 'Enebro'],
                instructions: 'Sacudir aquavit, lingonberry, lima y miel con hielo. Colar en copa coupe. Decorar con bayas de enebro.',
                alcohol: 'brandy',
                flavor: 'herbal',
                difficulty: 'medio',
                glass: 'copa',
                technique: 'agitar',
                occasion: 'digestivo',
                time: '4 min',
                rating: 4.4,
                year: '2016',
                origin: 'Suecia'
            },
            {
                id: 'sahara-sunset',
                name: 'Sahara Sunset',
                description: 'Cóctel norteafricano con té de menta y naranja, inspirado en el desierto.',
                ingredients: ['2 oz Vodka', '0.75 oz Orange Blossom', '0.5 oz Lime', '0.5 oz Mint Tea', 'Azafrán'],
                instructions: 'Sacudir vodka, orange blossom, lima y té de menta con hielo. Colar en copa coupe. Decorar con azafrán.',
                alcohol: 'vodka',
                flavor: 'herbal',
                difficulty: 'medio',
                glass: 'copa',
                technique: 'agitar',
                occasion: 'romántico',
                time: '4 min',
                rating: 4.6,
                year: '2021',
                origin: 'Marruecos'
            },
            {
                id: 'viking-funeral',
                name: 'Viking Funeral',
                description: 'Cóctel nórdico con aquavit y ahumado, inspirado en rituales vikingos.',
                ingredients: ['2 oz Aquavit', '0.75 oz Mezcal', '0.5 oz Lime', '0.5 oz Honey', 'Ahumado de brezo'],
                instructions: 'Ahumar mezcal con brezo. Sacudir aquavit, mezcal, lima y miel con hielo. Colar en copa old-fashioned. Decorar con hierbas.',
                alcohol: 'brandy',
                flavor: 'ahumado',
                difficulty: 'difícil',
                glass: 'old-fashioned',
                technique: 'agitar',
                occasion: 'digestivo',
                time: '5 min',
                rating: 4.3,
                year: '2022',
                origin: 'Noruega'
            },
            {
                id: 'crystal-mountain',
                name: 'Crystal Mountain',
                description: 'Cóctel alpino con gin y montaña, inspirado en los Alpes suizos.',
                ingredients: ['2 oz Alpine Gin', '0.75 oz Edelweiss Syrup', '0.5 oz Lime', '0.5 oz Pine', 'Nieve de pino'],
                instructions: 'Sacudir gin, jarabe de edelweiss, lima y pino con hielo. Colar en copa coupe. Decorar con nieve de pino.',
                alcohol: 'gin',
                flavor: 'herbal',
                difficulty: 'medio',
                glass: 'copa',
                technique: 'agitar',
                occasion: 'aperitivo',
                time: '4 min',
                rating: 4.7,
                year: '2023',
                origin: 'Suiza'
            },
            {
                id: 'pharaohs-dream',
                name: 'Pharaoh\'s Dream',
                description: 'Cóctel egipcio con dátiles y hibisco, inspirado en la antigüedad.',
                ingredients: ['2 oz Egyptian Gin', '0.75 oz Date Syrup', '0.5 oz Lime', '0.5 oz Hibiscus', 'Pistachios'],
                instructions: 'Sacudir gin, jarabe de dátiles, lima e hibisco con hielo. Colar en copa coupe. Decorar con pistachos.',
                alcohol: 'gin',
                flavor: 'floral',
                difficulty: 'medio',
                glass: 'copa',
                technique: 'agitar',
                occasion: 'romántico',
                time: '4 min',
                rating: 4.5,
                year: '2024',
                origin: 'Egipto'
            },
            {
                id: 'samurai-honor',
                name: 'Samurai Honor',
                description: 'Cóctel japonés con sake y yuzu, inspirado en los samuráis.',
                ingredients: ['2 oz Japanese Whisky', '0.75 oz Sake', '0.5 oz Yuzu', '0.5 oz Ginger', 'Crisantemo'],
                instructions: 'Sacudir whisky, sake, yuzu y jengibre con hielo. Colar en copa coupe. Decorar con crisantemo.',
                alcohol: 'whisky',
                flavor: 'herbal',
                difficulty: 'difícil',
                glass: 'copa',
                technique: 'agitar',
                occasion: 'digestivo',
                time: '5 min',
                rating: 4.8,
                year: '2024',
                origin: 'Japón'
            },
            {
                id: 'aztec-gold',
                name: 'Aztec Gold',
                description: 'Cóctel mexicano con mezcal y chocolate, inspirado en los aztecas.',
                ingredients: ['2 oz Mezcal', '0.75 oz Chocolate Liqueur', '0.5 oz Lime', '0.5 oz Chili', 'Cacao en polvo'],
                instructions: 'Sacudir mezcal, licor de chocolate, lima y chile con hielo. Colar en copa old-fashioned. Decorar con cacao.',
                alcohol: 'brandy',
                flavor: 'especiado',
                difficulty: 'medio',
                glass: 'old-fashioned',
                technique: 'agitar',
                occasion: 'digestivo',
                time: '4 min',
                rating: 4.6,
                year: '2023',
                origin: 'México'
            },
            {
                id: 'celtic-mist',
                name: 'Celtic Mist',
                description: 'Cóctel irlandés con whiskey y trébol, inspirado en la mitología celta.',
                ingredients: ['2 oz Irish Whiskey', '0.75 oz Clover Honey', '0.5 oz Lime', '0.5 oz Heather', 'Trébol verde'],
                instructions: 'Sacudir whiskey, miel de trébol, lima y brezo con hielo. Colar en copa coupe. Decorar con trébol.',
                alcohol: 'whisky',
                flavor: 'herbal',
                difficulty: 'medio',
                glass: 'copa',
                technique: 'agitar',
                occasion: 'digestivo',
                time: '4 min',
                rating: 4.5,
                year: '2022',
                origin: 'Irlanda'
            },
            {
                id: 'byzantine-empire',
                name: 'Byzantine Empire',
                description: 'Cóctel griego con ouzo y granada, inspirado en el imperio bizantino.',
                ingredients: ['2 oz Ouzo', '0.75 oz Pomegranate', '0.5 oz Lime', '0.5 oz Rosemary', 'Granada en polvo'],
                instructions: 'Sacudir ouzo, granada, lima y romero con hielo. Colar en copa coupe. Decorar con granada en polvo.',
                alcohol: 'liqueur',
                flavor: 'herbal',
                difficulty: 'medio',
                glass: 'copa',
                technique: 'agitar',
                occasion: 'aperitivo',
                time: '4 min',
                rating: 4.4,
                year: '2021',
                origin: 'Grecia'
            },
            {
                id: 'olympus-nectar',
                name: 'Olympus Nectar',
                description: 'Cóctel griego con metaxa y miel, inspirado en los dioses del Olimpo.',
                ingredients: ['2 oz Metaxa', '0.75 oz Greek Honey', '0.5 oz Lemon', '0.5 oz Orange Blossom', 'Almendras tostadas'],
                instructions: 'Sacudir metaxa, miel griega, limón y azahar con hielo. Colar en copa coupe. Decorar con almendras.',
                alcohol: 'brandy',
                flavor: 'dulce',
                difficulty: 'fácil',
                glass: 'copa',
                technique: 'agitar',
                occasion: 'digestivo',
                time: '3 min',
                rating: 4.6,
                year: '2020',
                origin: 'Grecia'
            },
            {
                id: 'nordic-aurora',
                name: 'Nordic Aurora',
                description: 'Cóctel nórdico con aquavit y bayas, inspirado en la aurora boreal.',
                ingredients: ['2 oz Nordic Aquavit', '0.75 oz Lingonberry', '0.5 oz Lime', '0.5 oz Birch', 'Bayas de enebro'],
                instructions: 'Sacudir aquavit, lingonberry, lima y abedul con hielo. Colar en copa coupe. Decorar con bayas.',
                alcohol: 'brandy',
                flavor: 'frutal',
                difficulty: 'medio',
                glass: 'copa',
                technique: 'agitar',
                occasion: 'aperitivo',
                time: '4 min',
                rating: 4.7,
                year: '2024',
                origin: 'Finlandia'
            },
            {
                id: 'mediterranean-breeze',
                name: 'Mediterranean Breeze',
                description: 'Cóctel mediterráneo con ouzo y hierbas, inspirado en las islas griegas.',
                ingredients: ['2 oz Ouzo', '0.75 oz Mediterranean Herbs', '0.5 oz Lime', '0.5 oz Olive', 'Aceitunas kalamata'],
                instructions: 'Sacudir ouzo, hierbas mediterráneas, lima y aceituna con hielo. Colar en copa coupe. Decorar con aceitunas.',
                alcohol: 'liqueur',
                flavor: 'herbal',
                difficulty: 'medio',
                glass: 'copa',
                technique: 'agitar',
                occasion: 'aperitivo',
                time: '4 min',
                rating: 4.5,
                year: '2023',
                origin: 'Grecia'
            },
            {
                id: 'caribbean-pearl',
                name: 'Caribbean Pearl',
                description: 'Cóctel caribeño con ron y coco, inspirado en las playas del Caribe.',
                ingredients: ['2 oz Aged Rum', '0.75 oz Coconut Cream', '0.5 oz Lime', '0.5 oz Pineapple', 'Flor de hibisco'],
                instructions: 'Sacudir ron añejo, crema de coco, lima y piña con hielo. Colar en copa coupe. Decorar con hibisco.',
                alcohol: 'ron',
                flavor: 'dulce',
                difficulty: 'fácil',
                glass: 'copa',
                technique: 'agitar',
                occasion: 'fiesta',
                time: '3 min',
                rating: 4.8,
                year: '2022',
                origin: 'Jamaica'
            },
            {
                id: 'andean-sunrise',
                name: 'Andean Sunrise',
                description: 'Cóctel andino con pisco y quinua, inspirado en los Andes.',
                ingredients: ['2 oz Pisco', '0.75 oz Quinoa Syrup', '0.5 oz Lime', '0.5 oz Orange', 'Hoja de coca'],
                instructions: 'Sacudir pisco, jarabe de quinua, lima y naranja con hielo. Colar en copa coupe. Decorar con hoja de coca.',
                alcohol: 'brandy',
                flavor: 'herbal',
                difficulty: 'medio',
                glass: 'copa',
                technique: 'agitar',
                occasion: 'aperitivo',
                time: '4 min',
                rating: 4.6,
                year: '2021',
                origin: 'Perú'
            },
            {
                id: 'saharan-moon',
                name: 'Saharan Moon',
                description: 'Cóctel sahariano con té de menta y dátiles, inspirado en las noches del desierto.',
                ingredients: ['2 oz Vodka', '0.75 oz Date Syrup', '0.5 oz Lime', '0.5 oz Mint Tea', 'Hojas de menta'],
                instructions: 'Sacudir vodka, jarabe de dátiles, lima y té de menta con hielo. Colar en copa coupe. Decorar con menta.',
                alcohol: 'vodka',
                flavor: 'herbal',
                difficulty: 'fácil',
                glass: 'copa',
                technique: 'agitar',
                occasion: 'digestivo',
                time: '3 min',
                rating: 4.4,
                year: '2020',
                origin: 'Marruecos'
            },
            {
                id: 'arabian-nights',
                name: 'Arabian Nights',
                description: 'Cóctel árabe con arak y especias, inspirado en las mil y una noches.',
                ingredients: ['2 oz Arak', '0.75 oz Spiced Syrup', '0.5 oz Lime', '0.5 oz Cardamom', 'Canela en rama'],
                instructions: 'Sacudir arak, jarabe especiado, lima y cardamomo con hielo. Colar en copa coupe. Decorar con canela.',
                alcohol: 'brandy',
                flavor: 'especiado',
                difficulty: 'medio',
                glass: 'copa',
                technique: 'agitar',
                occasion: 'digestivo',
                time: '4 min',
                rating: 4.5,
                year: '2019',
                origin: 'Líbano'
            },
            {
                id: 'siberian-frost',
                name: 'Siberian Frost',
                description: 'Cóctel siberiano con vodka y bayas, inspirado en el invierno ruso.',
                ingredients: ['2 oz Russian Vodka', '0.75 oz Cranberry', '0.5 oz Lime', '0.5 oz Birch', 'Bayas de enebro'],
                instructions: 'Sacudir vodka, arándano, lima y abedul con hielo. Colar en copa coupe. Decorar con bayas.',
                alcohol: 'vodka',
                flavor: 'frutal',
                difficulty: 'fácil',
                glass: 'copa',
                technique: 'agitar',
                occasion: 'fiesta',
                time: '3 min',
                rating: 4.6,
                year: '2018',
                origin: 'Rusia'
            },
            {
                id: 'tropical-paradise',
                name: 'Tropical Paradise',
                description: 'Cóctel tropical con ron y frutas exóticas, inspirado en las islas del Pacífico.',
                ingredients: ['2 oz Aged Rum', '0.75 oz Passion Fruit', '0.5 oz Lime', '0.5 oz Mango', 'Flor de hibisco'],
                instructions: 'Sacudir ron añejo, maracuyá, lima y mango con hielo. Colar en copa coupe. Decorar con hibisco.',
                alcohol: 'ron',
                flavor: 'frutal',
                difficulty: 'fácil',
                glass: 'copa',
                technique: 'agitar',
                occasion: 'fiesta',
                time: '3 min',
                rating: 4.7,
                year: '2017',
                origin: 'Tahití'
            },
            {
                id: 'mountain-mist',
                name: 'Mountain Mist',
                description: 'Cóctel alpino con gin y hierbas, inspirado en las montañas suizas.',
                ingredients: ['2 oz Alpine Gin', '0.75 oz Alpine Herbs', '0.5 oz Lime', '0.5 oz Honey', 'Hierbas alpinas'],
                instructions: 'Sacudir gin alpino, hierbas alpinas, lima y miel con hielo. Colar en copa coupe. Decorar con hierbas.',
                alcohol: 'gin',
                flavor: 'herbal',
                difficulty: 'medio',
                glass: 'copa',
                technique: 'agitar',
                occasion: 'aperitivo',
                time: '4 min',
                rating: 4.5,
                year: '2016',
                origin: 'Suiza'
            },
            {
                id: 'desert-oasis',
                name: 'Desert Oasis',
                description: 'Cóctel desértico con tequila y agave, inspirado en los oasis del desierto.',
                ingredients: ['2 oz Añejo Tequila', '0.75 oz Agave Nectar', '0.5 oz Lime', '0.5 oz Prickly Pear', 'Flor de desierto'],
                instructions: 'Sacudir tequila añejo, néctar de agave, lima y chumbera con hielo. Colar en copa coupe. Decorar con flor.',
                alcohol: 'tequila',
                flavor: 'dulce',
                difficulty: 'medio',
                glass: 'copa',
                technique: 'agitar',
                occasion: 'digestivo',
                time: '4 min',
                rating: 4.6,
                year: '2015',
                origin: 'México'
            },
            {
                id: 'coastal-breeze',
                name: 'Coastal Breeze',
                description: 'Cóctel costero con gin y mar, inspirado en las costas atlánticas.',
                ingredients: ['2 oz Coastal Gin', '0.75 oz Sea Salt', '0.5 oz Lime', '0.5 oz Seaweed', 'Conchas marinas'],
                instructions: 'Sacudir gin costero, sal marina, lima y algas con hielo. Colar en copa coupe. Decorar con conchas.',
                alcohol: 'gin',
                flavor: 'salado',
                difficulty: 'medio',
                glass: 'copa',
                technique: 'agitar',
                occasion: 'aperitivo',
                time: '4 min',
                rating: 4.4,
                year: '2014',
                origin: 'Portugal'
            },
            {
                id: 'forest-dream',
                name: 'Forest Dream',
                description: 'Cóctel forestal con gin y bayas, inspirado en los bosques boreales.',
                ingredients: ['2 oz Forest Gin', '0.75 oz Wild Berries', '0.5 oz Lime', '0.5 oz Pine', 'Bayas silvestres'],
                instructions: 'Sacudir gin forestal, bayas silvestres, lima y pino con hielo. Colar en copa coupe. Decorar con bayas.',
                alcohol: 'gin',
                flavor: 'frutal',
                difficulty: 'medio',
                glass: 'copa',
                technique: 'agitar',
                occasion: 'digestivo',
                time: '4 min',
                rating: 4.7,
                year: '2013',
                origin: 'Canadá'
            },
            {
                id: 'urban-sunset',
                name: 'Urban Sunset',
                description: 'Cóctel urbano con vodka y cítricos, inspirado en las puestas de sol urbanas.',
                ingredients: ['2 oz Urban Vodka', '0.75 oz Blood Orange', '0.5 oz Lime', '0.5 oz Ginger', 'Cáscara de naranja'],
                instructions: 'Sacudir vodka urbano, naranja sanguina, lima y jengibre con hielo. Colar en copa coupe. Decorar con naranja.',
                alcohol: 'vodka',
                flavor: 'cítrico',
                difficulty: 'fácil',
                glass: 'copa',
                technique: 'agitar',
                occasion: 'fiesta',
                time: '3 min',
                rating: 4.5,
                year: '2012',
                origin: 'Nueva York'
            },
            {
                id: 'midnight-garden',
                name: 'Midnight Garden',
                description: 'Cóctel nocturno con gin y flores, inspirado en los jardines nocturnos.',
                ingredients: ['2 oz Garden Gin', '0.75 oz Floral Syrup', '0.5 oz Lime', '0.5 oz Lavender', 'Flores nocturnas'],
                instructions: 'Sacudir gin de jardín, jarabe floral, lima y lavanda con hielo. Colar en copa coupe. Decorar con flores.',
                alcohol: 'gin',
                flavor: 'floral',
                difficulty: 'medio',
                glass: 'copa',
                technique: 'agitar',
                occasion: 'romántico',
                time: '4 min',
                rating: 4.6,
                year: '2011',
                origin: 'Inglaterra'
            },
            {
                id: 'golden-harvest',
                name: 'Golden Harvest',
                description: 'Cóctel de cosecha con whisky y miel, inspirado en las cosechas doradas.',
                ingredients: ['2 oz Harvest Whisky', '0.75 oz Wild Honey', '0.5 oz Apple', '0.5 oz Cinnamon', 'Manzanas caramelizadas'],
                instructions: 'Sacudir whisky de cosecha, miel silvestre, manzana y canela con hielo. Colar en copa coupe. Decorar con manzana.',
                alcohol: 'whisky',
                flavor: 'dulce',
                difficulty: 'fácil',
                glass: 'copa',
                technique: 'agitar',
                occasion: 'digestivo',
                time: '3 min',
                rating: 4.7,
                year: '2010',
                origin: 'Escocia'
            },
            {
                id: 'crystal-dawn',
                name: 'Crystal Dawn',
                description: 'Cóctel del alba con vodka y bayas, inspirado en los amaneceres cristalinos.',
                ingredients: ['2 oz Crystal Vodka', '0.75 oz Elderflower', '0.5 oz Lime', '0.5 oz Raspberry', 'Cristales de azúcar'],
                instructions: 'Sacudir vodka cristalino, flor de saúco, lima y frambuesa con hielo. Colar en copa coupe. Decorar con cristales.',
                alcohol: 'vodka',
                flavor: 'floral',
                difficulty: 'fácil',
                glass: 'copa',
                technique: 'agitar',
                occasion: 'aperitivo',
                time: '3 min',
                rating: 4.8,
                year: '2009',
                origin: 'Suecia'
            },
            {
                id: 'emerald-isle',
                name: 'Emerald Isle',
                description: 'Cóctel irlandés con whiskey y trébol, inspirado en la isla esmeralda.',
                ingredients: ['2 oz Irish Whiskey', '0.75 oz Clover Syrup', '0.5 oz Lime', '0.5 oz Mint', 'Hojas de trébol'],
                instructions: 'Sacudir whiskey irlandés, jarabe de trébol, lima y menta con hielo. Colar en copa coupe. Decorar con trébol.',
                alcohol: 'whisky',
                flavor: 'herbal',
                difficulty: 'fácil',
                glass: 'copa',
                technique: 'agitar',
                occasion: 'aperitivo',
                time: '3 min',
                rating: 4.6,
                year: '2008',
                origin: 'Irlanda'
            },
            {
                id: 'sunset-boulevard',
                name: 'Sunset Boulevard',
                description: 'Cóctel de Hollywood con gin y cítricos, inspirado en la famosa calle.',
                ingredients: ['2 oz Hollywood Gin', '0.75 oz Orange', '0.5 oz Lime', '0.5 oz Grapefruit', 'Cáscara de naranja'],
                instructions: 'Sacudir gin de Hollywood, naranja, lima y grapefruit con hielo. Colar en copa coupe. Decorar con naranja.',
                alcohol: 'gin',
                flavor: 'cítrico',
                difficulty: 'fácil',
                glass: 'copa',
                technique: 'agitar',
                occasion: 'fiesta',
                time: '3 min',
                rating: 4.5,
                year: '2007',
                origin: 'California'
            },
            {
                id: 'moonlight-serenade',
                name: 'Moonlight Serenade',
                description: 'Cóctel nocturno con vodka y bayas, inspirado en las serenatas nocturnas.',
                ingredients: ['2 oz Moonlight Vodka', '0.75 oz Blackberry', '0.5 oz Lime', '0.5 oz Vanilla', 'Bayas silvestres'],
                instructions: 'Sacudir vodka lunar, mora, lima y vainilla con hielo. Colar en copa coupe. Decorar con bayas.',
                alcohol: 'vodka',
                flavor: 'dulce',
                difficulty: 'fácil',
                glass: 'copa',
                technique: 'agitar',
                occasion: 'romántico',
                time: '3 min',
                rating: 4.7,
                year: '2006',
                origin: 'Francia'
            },
            {
                id: 'golden-hour',
                name: 'Golden Hour',
                description: 'Cóctel dorado con whisky y miel, inspirado en la hora dorada.',
                ingredients: ['2 oz Golden Whisky', '0.75 oz Golden Honey', '0.5 oz Orange', '0.5 oz Ginger', 'Cáscara de naranja'],
                instructions: 'Sacudir whisky dorado, miel dorada, naranja y jengibre con hielo. Colar en copa coupe. Decorar con naranja.',
                alcohol: 'whisky',
                flavor: 'dulce',
                difficulty: 'fácil',
                glass: 'copa',
                technique: 'agitar',
                occasion: 'aperitivo',
                time: '3 min',
                rating: 4.6,
                year: '2005',
                origin: 'Escocia'
            },
            {
                id: 'crystal-clear',
                name: 'Crystal Clear',
                description: 'Cóctel cristalino con vodka y bayas, inspirado en la claridad cristalina.',
                ingredients: ['2 oz Crystal Vodka', '0.75 oz Crystal Berry', '0.5 oz Lime', '0.5 oz Mint', 'Cristales de azúcar'],
                instructions: 'Sacudir vodka cristalino, bayas cristalinas, lima y menta con hielo. Colar en copa coupe. Decorar con cristales.',
                alcohol: 'vodka',
                flavor: 'frutal',
                difficulty: 'fácil',
                glass: 'copa',
                technique: 'agitar',
                occasion: 'fiesta',
                time: '3 min',
                rating: 4.8,
                year: '2004',
                origin: 'Suiza'
            },
            {
                id: 'emerald-dream',
                name: 'Emerald Dream',
                description: 'Cóctel esmeralda con gin y hierbas, inspirado en los sueños esmeralda.',
                ingredients: ['2 oz Emerald Gin', '0.75 oz Emerald Syrup', '0.5 oz Lime', '0.5 oz Mint', 'Hierbas esmeralda'],
                instructions: 'Sacudir gin esmeralda, jarabe esmeralda, lima y menta con hielo. Colar en copa coupe. Decorar con hierbas.',
                alcohol: 'gin',
                flavor: 'herbal',
                difficulty: 'medio',
                glass: 'copa',
                technique: 'agitar',
                occasion: 'romántico',
                time: '4 min',
                rating: 4.7,
                year: '2003',
                origin: 'Irlanda'
            },
            {
                id: 'sunset-paradise',
                name: 'Sunset Paradise',
                description: 'Cóctel paraíso con ron y frutas, inspirado en los paraísos tropicales.',
                ingredients: ['2 oz Paradise Rum', '0.75 oz Tropical Fruits', '0.5 oz Lime', '0.5 oz Coconut', 'Flores tropicales'],
                instructions: 'Sacudir ron paraíso, frutas tropicales, lima y coco con hielo. Colar en copa coupe. Decorar con flores.',
                alcohol: 'ron',
                flavor: 'frutal',
                difficulty: 'fácil',
                glass: 'copa',
                technique: 'agitar',
                occasion: 'fiesta',
                time: '3 min',
                rating: 4.8,
                year: '2002',
                origin: 'Hawái'
            },
            {
                id: 'crystal-moon',
                name: 'Crystal Moon',
                description: 'Cóctel lunar con vodka y bayas, inspirado en la luz lunar cristalina.',
                ingredients: ['2 oz Crystal Moon Vodka', '0.75 oz Moon Berries', '0.5 oz Lime', '0.5 oz Lavender', 'Cristales lunares'],
                instructions: 'Sacudir vodka lunar, bayas lunares, lima y lavanda con hielo. Colar en copa coupe. Decorar con cristales.',
                alcohol: 'vodka',
                flavor: 'floral',
                difficulty: 'fácil',
                glass: 'copa',
                technique: 'agitar',
                occasion: 'romántico',
                time: '3 min',
                rating: 4.7,
                year: '2001',
                origin: 'Luna'
            },
            {
                id: 'golden-paradise',
                name: 'Golden Paradise',
                description: 'Cóctel dorado con whisky y miel, inspirado en los paraísos dorados.',
                ingredients: ['2 oz Golden Paradise Whisky', '0.75 oz Paradise Honey', '0.5 oz Orange', '0.5 oz Ginger', 'Flores doradas'],
                instructions: 'Sacudir whisky paraíso dorado, miel paraíso, naranja y jengibre con hielo. Colar en copa coupe. Decorar con flores.',
                alcohol: 'whisky',
                flavor: 'dulce',
                difficulty: 'fácil',
                glass: 'copa',
                technique: 'agitar',
                occasion: 'fiesta',
                time: '3 min',
                rating: 4.8,
                year: '2000',
                origin: 'Paraíso'
            },
            // Mocktails - Recetas sin Alcohol
            {
                id: 'virgin-mojito',
                name: 'Virgin Mojito',
                description: 'Refrescante mocktail cubano con menta y lima, sin alcohol.',
                ingredients: ['10 hojas de menta', '2 oz de jugo de lima fresca', '2 cucharadas de azúcar', 'Soda', 'Hielo', 'Ramita de menta'],
                instructions: 'PASO 1: Colocar hojas de menta en vaso highball. PASO 2: Añadir azúcar y jugo de lima. PASO 3: Macerar suavemente 5-6 veces. PASO 4: Llenar vaso con hielo. PASO 5: Completar con soda bien fría. PASO 6: Remover suavemente y decorar con menta. CONSEJOS: Usa menta fresca de buena calidad. No machacar demasiado la menta. El azúcar debe disolverse completamente. Sirve inmediatamente.',
                alcohol: 'sin-alcohol',
                flavor: 'cítrico',
                difficulty: 'fácil',
                glass: 'highball',
                technique: 'construir',
                occasion: 'fiesta',
                time: '3 min',
                rating: 4.7,
                year: '2020',
                origin: 'Cuba'
            },
            {
                id: 'shirley-temple',
                name: 'Shirley Temple',
                description: 'Clásico mocktail con ginger ale y granada, favorito de todos.',
                ingredients: ['2 oz de jugo de granada', '4 oz de ginger ale', 'Hielo', 'Cereza marrón'],
                instructions: 'PASO 1: Llenar vaso highball con hielo. PASO 2: Añadir jugo de granada. PASO 3: Completar con ginger ale. PASO 4: Remover suavemente. PASO 5: Decorar con cereza marrón. CONSEJOS: Usa ginger ale de buena calidad. El jugo de granada debe ser 100% natural. La cereza debe ser marrón (maraschino). Sirve muy frío.',
                alcohol: 'sin-alcohol',
                flavor: 'dulce',
                difficulty: 'fácil',
                glass: 'highball',
                technique: 'construir',
                occasion: 'infantil',
                time: '2 min',
                rating: 4.5,
                year: '1930',
                origin: 'California'
            },
            {
                id: 'virgin-mary',
                name: 'Virgin Mary',
                description: 'Mocktail picante con jugo de tomate y especias, versión sin alcohol del Bloody Mary.',
                ingredients: ['4 oz de jugo de tomate', '1 oz de jugo de lima', '2 dashes de salsa picante', 'Sal y pimienta', 'Apio', 'Hielo'],
                instructions: 'PASO 1: Llenar vaso highball con hielo. PASO 2: Añadir jugo de tomate y jugo de lima. PASO 3: Añadir salsa picante, sal y pimienta. PASO 4: Remover bien. PASO 5: Decorar con tallo de apio. CONSEJOS: Usa jugo de tomate de buena calidad. Ajusta el picante al gusto. El apio debe estar fresco y crujiente. Sirve con sal en el borde.',
                alcohol: 'sin-alcohol',
                flavor: 'salado',
                difficulty: 'fácil',
                glass: 'highball',
                technique: 'construir',
                occasion: 'aperitivo',
                time: '3 min',
                rating: 4.3,
                year: '1940',
                origin: 'Nueva York'
            },
            {
                id: 'blue-lagoon',
                name: 'Blue Lagoon',
                description: 'Mocktail azul brillante con cítricos, refrescante y visualmente atractivo.',
                ingredients: ['1 oz de sirope de curacao azul', '2 oz de jugo de lima', '4 oz de lemon-lime soda', 'Hielo', 'Rodaja de lima'],
                instructions: 'PASO 1: Llenar vaso highball con hielo. PASO 2: Añadir sirope de curacao azul. PASO 3: Añadir jugo de lima. PASO 4: Completar con lemon-lime soda. PASO 5: Remover suavemente. PASO 6: Decorar con rodaja de lima. CONSEJOS: El curacao azul es inofensivo. Usa lima fresca. La soda debe estar bien fría. No agites demasiado.',
                alcohol: 'sin-alcohol',
                flavor: 'cítrico',
                difficulty: 'fácil',
                glass: 'highball',
                technique: 'construir',
                occasion: 'fiesta',
                time: '2 min',
                rating: 4.4,
                year: '1960',
                origin: 'Francia'
            },
            {
                id: 'arnold-palmer',
                name: 'Arnold Palmer',
                description: 'Clásica combinación de té helado y limonada, refrescante y popular.',
                ingredients: ['4 oz de té helado', '2 oz de limonada', 'Hielo', 'Rodaja de limón'],
                instructions: 'PASO 1: Preparar té helado fuerte y dejar enfriar. PASO 2: Llenar vaso highball con hielo. PASO 3: Añadir té helado y limonada. PASO 4: Remover suavemente. PASO 5: Decorar con rodaja de limón. CONSEJOS: Usa té helado de buena calidad. La proporción puede ajustarse al gusto. El té debe estar bien frío. Sirve con pajita.',
                alcohol: 'sin-alcohol',
                flavor: 'cítrico',
                difficulty: 'fácil',
                glass: 'highball',
                technique: 'construir',
                occasion: 'verano',
                time: '2 min',
                rating: 4.6,
                year: '1960',
                origin: 'California'
            },
            {
                id: 'royal-aztec',
                name: 'Royal Aztec',
                description: 'Mocktail mexicano con chocolate y canela, inspirado en los aztecas.',
                ingredients: ['2 oz de leche de almendras', '1 oz de jarabe de chocolate', '0.5 oz de canela', '4 oz de agua de tamarindo', 'Cacao en polvo'],
                instructions: 'PASO 1: Preparar agua de tamarindo concentrada. PASO 2: Mezclar leche de almendras con jarabe de chocolate. PASO 3: Añadir canela y agua de tamarindo. PASO 4: Remover bien con hielo. PASO 5: Espolvorear cacao en polvo. CONSEJOS: Usa leche de almendras sin azúcar. El chocolate debe ser de buena calidad. La canela debe ser en rama. Sirve en vaso old-fashioned.',
                alcohol: 'sin-alcohol',
                flavor: 'dulce',
                difficulty: 'medio',
                glass: 'old-fashioned',
                technique: 'construir',
                occasion: 'digestivo',
                time: '4 min',
                rating: 4.5,
                year: '2021',
                origin: 'México'
            },
            // Recetas Internacionales Adicionales
            {
                id: 'caipirinha',
                name: 'Caipirinha',
                description: 'Cóctel nacional de Brasil con cachaça y lima, fresco y tropical.',
                ingredients: ['2 oz de cachaça', '1 lima verde', '2 cucharadas de azúcar', 'Hielo', 'Rodaja de lima'],
                instructions: 'PASO 1: Cortar lima en 8 gajos. PASO 2: Colocar gajos en vaso old-fashioned. PASO 3: Añadir azúcar y macerar suavemente. PASO 4: Añadir cachaça y hielo. PASO 5: Remover bien. PASO 6: Decorar con rodaja de lima. CONSEJOS: Usa cachaça de buena calidad. No machacar demasiado la lima. El azúcar debe ser cristal. Sirve muy frío.',
                alcohol: 'cachaça',
                flavor: 'cítrico',
                difficulty: 'fácil',
                glass: 'old-fashioned',
                technique: 'macerar',
                occasion: 'fiesta',
                time: '3 min',
                rating: 4.8,
                year: '1800',
                origin: 'Brasil'
            },
            {
                id: 'pisco-sour',
                name: 'Pisco Sour',
                description: 'Cóctel peruano con pisco y lima, balance perfecto entre dulce y ácido.',
                ingredients: ['2 oz de pisco peruano', '1 oz de jugo de lima', '1 oz de jarabe de azúcar', '1 clara de huevo', 'Angostura', 'Hielo'],
                instructions: 'PASO 1: Enfriar copa sour en congelador. PASO 2: Mezclar pisco, jugo de lima, jarabe y clara en shaker. PASO 3: Agitar vigorosamente sin hielo (dry shake). PASO 4: Añadir hielo y agitar de nuevo. PASO 5: Colar en copa fría. PASO 6: Añadir 2 dashes de Angostura. CONSEJOS: Usa pisco peruano pisco. La clara debe ser fresca. El jarabe debe estar 1:1. No agites demasiado para evitar espuma excesiva.',
                alcohol: 'pisco',
                flavor: 'cítrico',
                difficulty: 'medio',
                glass: 'copa',
                technique: 'agitar',
                occasion: 'aperitivo',
                time: '4 min',
                rating: 4.7,
                year: '1920',
                origin: 'Perú'
            },
            {
                id: 'bellini',
                name: 'Bellini',
                description: 'Cóctel italiano elegante con melocotón y prosecco, nacido en Venecia.',
                ingredients: ['2 oz de puré de melocotón blanco', '4 oz de prosecco frío', 'Hielo', 'Rodaja de melocotón'],
                instructions: 'PASO 1: Preparar puré de melocotón blanco fresco. PASO 2: Enfriar copa flute. PASO 3: Añadir puré de melocotón en copa. PASO 4: Verter prosecco frío lentamente. PASO 5: Remover suavemente. PASO 6: Decorar con rodaja de melocotón. CONSEJOS: Usa melocotón blanco de temporada. El prosecco debe estar muy frío. No agites nunca. Sirve inmediatamente para mantener carbonatación.',
                alcohol: 'espumante',
                flavor: 'dulce',
                difficulty: 'fácil',
                glass: 'flute',
                technique: 'construir',
                occasion: 'romántico',
                time: '3 min',
                rating: 4.6,
                year: '1948',
                origin: 'Italia'
            },
            {
                id: 'moscow-mule',
                name: 'Moscow Mule',
                description: 'Cóctel ruso con vodka y jengibre, servido en icónica copa de cobre.',
                ingredients: ['2 oz de vodka ruso', '4 oz de ginger beer', '0.5 oz de jugo de lima', 'Hielo', 'Rodaja de lima', 'Jengibre fresco'],
                instructions: 'PASO 1: Enfriar copa de cobre en congelador. PASO 2: Llenar copa con hielo. PASO 3: Añadir vodka y jugo de lima. PASO 4: Completar con ginger beer. PASO 5: Remover suavemente. PASO 6: Decorar con lima y jengibre. CONSEJOS: La copa de cobre es tradicional. Usa ginger beer de calidad. El jengibre debe estar fresco. Sirve muy frío sin agitar.',
                alcohol: 'vodka',
                flavor: 'especiado',
                difficulty: 'fácil',
                glass: 'copper',
                technique: 'construir',
                occasion: 'fiesta',
                time: '2 min',
                rating: 4.5,
                year: '1941',
                origin: 'California',
                variants: ['moscow-mule-vodka-premium']
            },
            {
                id: 'sangria',
                name: 'Sangria',
                description: 'Bebida festiva española con vino y frutas, perfecta para compartir.',
                ingredients: ['1 botella de vino tinto', ['2 naranjas', '1 limón', '1 manzana'], '2 cucharadas de azúcar', '1 canela en rama', 'Hielo'],
                instructions: 'PASO 1: Cortar frutas en gajos pequeños. PASO 2: Colocar frutas en jarra grande. PASO 3: Añadir azúcar y canela. PASO 4: Verter vino tinto sobre frutas. PASO 5: Refrigerar mínimo 2 horas. PASO 6: Servir con hielo y fruta fresca. CONSEJOS: Usa vino tinto joven y frutoso. Las frutas deben estar frescas. Puede añadirse brandy para más fuerza. Sirve muy fría.',
                alcohol: 'vino',
                flavor: 'frutal',
                difficulty: 'fácil',
                glass: 'jarra',
                technique: 'construir',
                occasion: 'fiesta',
                time: '10 min',
                rating: 4.8,
                year: '1700',
                origin: 'España',
                variants: []
            },
            {
                id: 'irish-coffee',
                name: 'Irish Coffee',
                description: 'Cóctel caliente irlandés con whiskey y café, perfecto para climas fríos.',
                ingredients: ['1.5 oz de whiskey irlandés', '4 oz de café caliente', '1 cucharada de azúcar', 'Crema espesa', 'Nuez moscada'],
                instructions: 'PASO 1: Preparar café caliente y fuerte. PASO 2: Calentar vaso irish coffee. PASO 3: Añadir whiskey y azúcar. PASO 4: Verter café caliente. PASO 5: Flotar crema espesa sobre el café. PASO 6: Espolvorear nuez moscada. CONSEJOS: Usa whiskey irlandés suave. El café debe estar bien caliente. La crema debe estar espesa sin batir. No mezcles la crema.',
                alcohol: 'whisky',
                flavor: 'dulce',
                difficulty: 'medio',
                glass: 'irish',
                technique: 'construir',
                occasion: 'digestivo',
                time: '5 min',
                rating: 4.6,
                year: '1940',
                origin: 'Irlanda'
            },
            {
                id: 'mai-tai',
                name: 'Mai Tai',
                description: 'Cóctel tropical tiki con ron y cítricos, creado en California.',
                ingredients: ['1 oz de ron blanco', '1 oz de ron oscuro', '0.75 oz de jugo de lima', '0.5 oz de triple sec', '0.5 oz de orgeat', 'Menta', 'Hielo'],
                instructions: 'PASO 1: Llenar shaker con hielo. PASO 2: Añadir ron blanco, jugo de lima, triple sec y orgeat. PASO 3: Agitar vigorosamente 15 segundos. PASO 4: Colar en vaso old-fashioned con hielo fresco. PASO 5: Flotar ron oscuro sobre la bebida. PASO 6: Decorar con menta. CONSEJOS: Usa ron blanco ligero y ron oscuro añejo. El orgeat es esencial. No agites demasiado. Sirve inmediatamente.',
                alcohol: 'ron',
                flavor: 'cítrico',
                difficulty: 'medio',
                glass: 'old-fashioned',
                technique: 'agitar',
                occasion: 'fiesta',
                time: '4 min',
                rating: 4.7,
                year: '1944',
                origin: 'California'
            },
            {
                id: 'daiquiri',
                name: 'Daiquiri',
                description: 'Cóctel cubano clásico con ron y lima, refrescante y elegante.',
                ingredients: ['2 oz de ron blanco', '1 oz de jugo de lima', '0.75 oz de jarabe de azúcar', 'Hielo', 'Rodaja de lima'],
                instructions: 'PASO 1: Enfriar copa coupe en congelador. PASO 2: Llenar shaker con hielo. PASO 3: Añadir ron blanco, jugo de lima y jarabe. PASO 4: Agitar vigorosamente 12 segundos. PASO 5: Colar en copa fría sin hielo. PASO 6: Decorar con rodaja de lima. CONSEJOS: Usa ron blanco cubano de buena calidad. El jugo de lima debe ser fresco. El jarabe debe estar 1:1. No agites demasiado para mantener textura.',
                alcohol: 'ron',
                flavor: 'cítrico',
                difficulty: 'fácil',
                glass: 'coupe',
                technique: 'agitar',
                occasion: 'aperitivo',
                time: '3 min',
                rating: 4.6,
                year: '1900',
                origin: 'Cuba'
            },
            {
                id: 'aperol-spritz',
                name: 'Aperol Spritz',
                description: 'Cóctel italiano popular con Aperol y prosecco, ligero y refrescante.',
                ingredients: ['2 oz de Aperol', '3 oz de prosecco', '1 oz de soda', 'Hielo', 'Naranja'],
                instructions: 'PASO 1: Llenar vaso wine con hielo. PASO 2: Añadir Aperol. PASO 3: Verter prosecco frío. PASO 4: Completar con soda. PASO 5: Remover suavemente. PASO 6: Decorar con rodaja de naranja. CONSEJOS: Usa Aperol de buena calidad. El prosecco debe estar frío. La soda debe ser de buena calidad. Sirve con pajita.',
                alcohol: 'aperitivo',
                flavor: 'amargo',
                difficulty: 'fácil',
                glass: 'wine',
                technique: 'construir',
                occasion: 'aperitivo',
                time: '2 min',
                rating: 4.5,
                year: '1950',
                origin: 'Italia'
            },
            {
                id: 'margarita',
                name: 'Margarita',
                description: 'Cóctel mexicano icónico con tequila y lima, servido con sal en el borde.',
                ingredients: ['2 oz de tequila blanco', '1 oz de triple sec', '1 oz de jugo de lima', 'Sal para el borde', 'Hielo', 'Rodaja de lima'],
                instructions: 'PASO 1: Preparar borde de sal con lima y sal gruesa. PASO 2: Llenar shaker con hielo. PASO 3: Añadir tequila, triple sec y jugo de lima. PASO 4: Agitar vigorosamente 15 segundos. PASO 5: Colar en copa margarita con borde salado. PASO 6: Decorar con rodaja de lima. CONSEJOS: Usa tequila blanco 100% agave. El triple sec debe ser de buena calidad. La lima debe estar fresca. Sirve muy frío.',
                alcohol: 'tequila',
                flavor: 'cítrico',
                difficulty: 'fácil',
                glass: 'margarita',
                technique: 'agitar',
                occasion: 'fiesta',
                time: '3 min',
                rating: 4.8,
                year: '1938',
                origin: 'México',
                variants: ['paloma', 'margarita-reposado']
            },
            // Nuevas recetas con alcoholes expandidos
            {
                id: 'paloma',
                name: 'Paloma',
                description: 'Cóctel mexicano clásico con tequila y toronja, refrescante y popular.',
                ingredients: ['2 oz de tequila blanco', '0.5 oz de jugo de toronja fresca', 'Sal', 'Soda de toronja', 'Rodaja de toronja'],
                instructions: 'PASO 1: Escarchar borde del vaso con sal. PASO 2: Llenar vaso highball con hielo. PASO 3: Añadir tequila y jugo de toronja. PASO 4: Completar con soda de toronja. PASO 5: Remover suavemente. PASO 6: Decorar con rodaja de toronja. CONSEJOS: Usa tequila blanco de buena calidad. El jugo de toronja debe ser fresco. La soda debe estar bien fría. Sirve inmediatamente.',
                alcohol: 'tequila-blanco',
                flavor: 'cítrico',
                difficulty: 'fácil',
                glass: 'highball',
                technique: 'construir',
                occasion: 'fiesta',
                time: '2 min',
                rating: 4.6,
                year: '1950',
                origin: 'México',
                variants: ['margarita']
            },
            {
                id: 'margarita-reposado',
                name: 'Margarita Reposado',
                description: 'Variación premium de margarita con tequila reposado para mayor complejidad.',
                ingredients: ['2 oz de tequila reposado', '1 oz de jugo de lima', '0.5 oz de Cointreau', 'Sal', 'Rodaja de lima'],
                instructions: 'PASO 1: Escarchar borde de copa margarita con sal. PASO 2: Llenar shaker con hielo. PASO 3: Añadir tequila reposado, jugo de lima y Cointreau. PASO 4: Agitar vigorosamente 15 segundos. PASO 5: Colar en copa preparada sin hielo. PASO 6: Decorar con rodaja de lima. CONSEJOS: El tequila reposado añade notas de vainilla y roble. No agitar demasiado para evitar dilución. La sal debe ser marina fina. Sirve bien fría.',
                alcohol: 'tequila-reposado',
                flavor: 'cítrico',
                difficulty: 'medio',
                glass: 'margarita',
                technique: 'agitar',
                occasion: 'romántico',
                time: '3 min',
                rating: 4.8,
                year: '1970',
                origin: 'México',
                variants: ['margarita', 'paloma']
            },
            {
                id: 'old-fashioned-bourbon',
                name: 'Old Fashioned Bourbon',
                description: 'Clásico americano con bourbon, azúcar y angostura, elegante y sofisticado.',
                ingredients: ['2 oz de bourbon', '1 terrón de azúcar', '2 dashes de Angostura', '1 dash de agua', 'Cáscara de naranja', 'Cereza marrón'],
                instructions: 'PASO 1: Colocar terrón de azúcar en vaso old-fashioned. PASO 2: Añadir dashes de Angostura y agua. PASO 3: Disolver azúcar con muddler. PASO 4: Añadir bourbon y hielo grande. PASO 5: Revolver 30 segundos. PASO 6: Expresar cáscara de naranja y decorar. CONSEJOS: Usa bourbon de calidad como Maker\'s Mark. El azúcar debe disolverse completamente. La cáscara de naranja debe exprimirse sobre la bebida. Sirve con hielo grande.',
                alcohol: 'whisky-bourbon',
                flavor: 'dulce',
                difficulty: 'medio',
                glass: 'old-fashioned',
                technique: 'revolver',
                occasion: 'clásico',
                time: '4 min',
                rating: 4.9,
                year: '1800',
                origin: 'EEUU',
                variants: ['manhattan']
            },
            {
                id: 'negroni-gin-old-tom',
                name: 'Negroni Gin Old Tom',
                description: 'Variación histórica del Negroni con gin Old Tom para mayor dulzura.',
                ingredients: ['1 oz de gin Old Tom', '1 oz de Campari', '1 oz de vermut dulce', 'Cáscara de naranja', 'Hielo'],
                instructions: 'PASO 1: Llenar mixing glass con hielo. PASO 2: Añadir gin Old Tom, Campari y vermut dulce. PASO 3: Revolver con cuchara de bar 30 segundos. PASO 4: Colar en copa old-fashioned con hielo fresco. PASO 5: Expresar cáscara de naranja sobre bebida. PASO 6: Decorar con cáscara de naranja. CONSEJOS: El gin Old Tom añade notas botánicas dulces. Usa Campari de calidad. El vermut debe ser dulce italiano. Sirve bien frío.',
                alcohol: 'gin-old-tom',
                flavor: 'amargo',
                difficulty: 'medio',
                glass: 'old-fashioned',
                technique: 'revolver',
                occasion: 'aperitivo',
                time: '3 min',
                rating: 4.7,
                year: '1920',
                origin: 'Italia',
                variants: ['negroni']
            },
            {
                id: 'daiquiri-ron-blanco',
                name: 'Daiquirí Ron Blanco',
                description: 'Clásico cubano con ron blanco, lima y azúcar, simple y elegante.',
                ingredients: ['2 oz de ron blanco', '1 oz de jugo de lima', '0.5 oz de jarabe de azúcar', 'Hielo', 'Rodaja de lima'],
                instructions: 'PASO 1: Llenar shaker con hielo. PASO 2: Añadir ron blanco, jugo de lima y jarabe. PASO 3: Agitar vigorosamente 15 segundos. PASO 4: Colar en copa coupe fría sin hielo. PASO 5: Decorar con rodaja de lima. CONSEJOS: Usa ron blanco cubano como Havana Club. El jugo de lima debe ser fresco. El jarabe debe estar bien diluido. No agitar demasiado para evitar espuma excesiva.',
                alcohol: 'ron-blanco',
                flavor: 'cítrico',
                difficulty: 'fácil',
                glass: 'coupe',
                technique: 'agitar',
                occasion: 'fiesta',
                time: '2 min',
                rating: 4.6,
                year: '1898',
                origin: 'Cuba',
                variants: ['mojito', 'pina-colada']
            },
            {
                id: 'mezcal-oma',
                name: 'Mezcal Oma',
                description: 'Cóctel contemporáneo con mezcal, toronja y amargo, complejo y sofisticado.',
                ingredients: ['2 oz de mezcal', '0.75 oz de jugo de toronja', '0.5 oz de licor de agave', '2 dashes de amargo de toronja', 'Sal de gusano'],
                instructions: 'PASO 1: Escarchar borde de copa con sal de gusano. PASO 2: Llenar shaker con hielo. PASO 3: Añadir mezcal, jugo de toronja y licor de agave. PASO 4: Agitar vigorosamente 12 segundos. PASO 5: Colar en copa coupe preparada. PASO 6: Añadir dashes de amargo y decorar. CONSEJOS: Usa mezcal espadín joven. La sal de gusano es tradicional oaxaqueña. El amargo de toronja añade complejidad. Sirve sin hielo.',
                alcohol: 'mezcal',
                flavor: 'ahumado',
                difficulty: 'medio',
                glass: 'coupe',
                technique: 'agitar',
                occasion: 'moderno',
                time: '4 min',
                rating: 4.8,
                year: '2010',
                origin: 'México',
                variants: ['paloma', 'margarita']
            },
            {
                id: 'moscow-mule-vodka-premium',
                name: 'Moscow Mule Vodka Premium',
                description: 'Versión premium del clásico con vodka premium y jengibre fresco.',
                ingredients: ['2 oz de vodka premium', '4 oz de ginger beer artesanal', '0.5 oz de jugo de lima', 'Hielo', 'Rodaja de lima', 'Jengibre fresco'],
                instructions: 'PASO 1: Enfriar copa de cobre en congelador. PASO 2: Llenar copa con hielo de calidad. PASO 3: Añadir vodka premium y jugo de lima fresco. PASO 4: Completar con ginger beer artesanal. PASO 5: Remover suavemente con cuchara de bar. PASO 6: Decorar con lima y jengibre. CONSEJOS: Usa vodka premium como Grey Goose o Belvedere. La ginger beer debe ser artesanal. El jengibre fresco debe estar rallado finamente. Sirve muy frío.',
                alcohol: 'vodka-premium',
                flavor: 'especiado',
                difficulty: 'fácil',
                glass: 'copper',
                technique: 'construir',
                occasion: 'elegante',
                time: '2 min',
                rating: 4.7,
                year: '1950',
                origin: 'California',
                variants: ['moscow-mule']
            },
            {
                id: 'scotch-whisky-sour',
                name: 'Scotch Whisky Sour',
                description: 'Variación robusta del clásico sour con whisky escocés y clara de huevo.',
                ingredients: ['2 oz de whisky escocés', '0.75 oz de jugo de limón', '0.5 oz de jarabe de azúcar', '1 clara de huevo', 'Angostura', 'Cereza marrón'],
                instructions: 'PASO 1: Llenar shaker con hielo. PASO 2: Añadir whisky escocés, jugo de limón y jarabe. PASO 3: Añadir clara de huevo y agitar seco 10 segundos. PASO 4: Añadir hielo y agitar vigorosamente 15 segundos. PASO 5: Colar en copa old-fashioned con hielo. PASO 6: Añadir dash de Angostura y decorar. CONSEJOS: Usa whisky escocés blended como Johnnie Walker. La clara de huevo añade textura sedosa. El dash de Angostura añade complejidad. Sirve bien frío.',
                alcohol: 'whisky-scotch',
                flavor: 'ácido',
                difficulty: 'difícil',
                glass: 'old-fashioned',
                technique: 'agitar',
                occasion: 'clásico',
                time: '5 min',
                rating: 4.8,
                year: '1870',
                origin: 'Escocia',
                variants: ['old-fashioned-bourbon']
            },
            {
                id: 'vodka-cosmopolitan-aromatizada',
                name: 'Vodka Cosmopolitan Aromatizada',
                description: 'Versión moderna del Cosmopolitan con vodka aromatizada y arándanos frescos.',
                ingredients: ['2 oz de vodka de cítricos', '1 oz de jugo de arándano', '0.5 oz de Cointreau', '0.5 oz de jugo de lima', 'Cáscara de lima', 'Arándanos frescos'],
                instructions: 'PASO 1: Llenar shaker con hielo. PASO 2: Añadir vodka de cítricos, jugo de arándano y Cointreau. PASO 3: Añadir jugo de lima fresco. PASO 4: Agitar vigorosamente 15 segundos. PASO 5: Colar en copa martini fría. PASO 6: Decorar con cáscara de lima y arándanos. CONSEJOS: Usa vodka de cítricos como Absolut Citron. El jugo de arándano debe ser 100% natural. Los arándanos frescos añaden color y sabor. Sirve muy frío.',
                alcohol: 'vodka-aromatizada',
                flavor: 'frutal',
                difficulty: 'fácil',
                glass: 'martini',
                technique: 'agitar',
                occasion: 'moderno',
                time: '3 min',
                rating: 4.6,
                year: '1990',
                origin: 'California',
                variants: ['cosmopolitan']
            }
        ];
    }

    // Advanced Filter System
    bindAdvancedFilters() {
        // Reset filters button
        const resetBtn = document.getElementById('resetFilters');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                document.querySelectorAll('[data-filter-type]').forEach(checkbox => {
                    checkbox.checked = false;
                });
                this.applyFilters();
            });
        }

        // Filter checkboxes
        document.querySelectorAll('[data-filter-type]').forEach(checkbox => {
            checkbox.addEventListener('change', () => {
                this.applyFilters();
            });
        });

        // Make filter items clickable
        document.querySelectorAll('.filter-item').forEach(item => {
            item.addEventListener('click', (e) => {
                if (!e.target.matches('input[type="checkbox"]')) {
                    const checkbox = item.querySelector('input[type="checkbox"]');
                    if (checkbox) {
                        checkbox.checked = !checkbox.checked;
                        this.applyFilters();
                    }
                }
            });
        });
    }

    bindSearch() {
        const searchInput = document.getElementById('searchInput');
        if (!searchInput) {
            return;
        }

        // Debounce for mobile performance
        let searchTimeout;
        
        searchInput.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            const query = e.target.value.toLowerCase().trim();
            
            // Immediate search for short queries, debounce for longer ones
            if (query.length < 3) {
                this.searchRecipes(query);
            } else {
                searchTimeout = setTimeout(() => {
                    this.searchRecipes(query);
                }, 300);
            }
        });

        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                clearTimeout(searchTimeout);
                const query = e.target.value.toLowerCase().trim();
                this.searchRecipes(query);
            }
        });

        // Mobile-specific improvements
        searchInput.addEventListener('focus', () => {
            // Scroll search into view on mobile
            if (window.innerWidth <= 768) {
                setTimeout(() => {
                    searchInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 100);
            }
        });

        // Clear search on escape
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                searchInput.value = '';
                this.searchRecipes('');
                searchInput.blur();
            }
        });
    }

    searchRecipes(query) {
        try {
            if (!query || query.trim() === '') {
                this.filteredRecipes = [...this.recipes];
            } else {
                const searchTerm = query.toLowerCase().trim();
                this.filteredRecipes = this.recipes.filter(recipe => {
                    if (!recipe || !recipe.name || !recipe.description) {
                        return false;
                    }
                    
                    const nameMatch = recipe.name.toLowerCase().includes(searchTerm);
                    const descriptionMatch = recipe.description.toLowerCase().includes(searchTerm);
                    const ingredientsMatch = Array.isArray(recipe.ingredients) && 
                        recipe.ingredients.some(ing => ing && ing.toLowerCase().includes(searchTerm));
                    
                    return nameMatch || descriptionMatch || ingredientsMatch;
                });
            }
            this.updateSearchStats();
            this.renderRecipes();
        } catch (error) {
            console.error('Error en búsqueda de recetas:', error);
            this.filteredRecipes = [...this.recipes];
            this.renderRecipes();
        }
    }

    updateSearchStats() {
        const statsElement = document.getElementById('searchStats');
        if (!statsElement) {
            return;
        }

        const count = this.filteredRecipes.length;
        const total = this.recipes.length;
        
        if (count === total) {
            statsElement.textContent = `${total} recetas disponibles`;
        } else {
            statsElement.textContent = `${count} de ${total} recetas`;
        }
    }

    // Advanced Filter System
    applyFilters() {
        try {
            const activeFilters = this.getActiveFilters();
            
            this.filteredRecipes = this.recipes.filter(recipe => {
                if (!recipe || !recipe.id) {
                    return false;
                }
                
                const alcoholMatch = !activeFilters.alcohol.length || activeFilters.alcohol.includes(recipe.alcohol);
                const flavorMatch = !activeFilters.flavor.length || activeFilters.flavor.includes(recipe.flavor);
                const difficultyMatch = !activeFilters.difficulty.length || activeFilters.difficulty.includes(recipe.difficulty);
                const glassMatch = !activeFilters.glass.length || activeFilters.glass.includes(recipe.glass);
                const techniqueMatch = !activeFilters.technique.length || activeFilters.technique.includes(recipe.technique);
                const occasionMatch = !activeFilters.occasion.length || activeFilters.occasion.includes(recipe.occasion);
                const originMatch = !activeFilters.origin.length || activeFilters.origin.includes(recipe.origin);
                
                return alcoholMatch && flavorMatch && difficultyMatch && glassMatch && 
                       techniqueMatch && occasionMatch && originMatch;
            });

            this.updateSearchStats();
            this.renderRecipes();
        } catch (error) {
            console.error('Error al aplicar filtros:', error);
            this.filteredRecipes = [...this.recipes];
            this.renderRecipes();
        }
    }

    getActiveFilters() {
        const filters = {
            alcohol: [],
            flavor: [],
            difficulty: [],
            glass: [],
            technique: [],
            occasion: [],
            origin: []
        };

        document.querySelectorAll('[data-filter-type="alcohol"]:checked').forEach(checkbox => {
            filters.alcohol.push(checkbox.dataset.filter);
        });

        document.querySelectorAll('[data-filter-type="flavor"]:checked').forEach(checkbox => {
            filters.flavor.push(checkbox.dataset.filter);
        });

        document.querySelectorAll('[data-filter-type="difficulty"]:checked').forEach(checkbox => {
            filters.difficulty.push(checkbox.dataset.filter);
        });

        document.querySelectorAll('[data-filter-type="glass"]:checked').forEach(checkbox => {
            filters.glass.push(checkbox.dataset.filter);
        });

        document.querySelectorAll('[data-filter-type="technique"]:checked').forEach(checkbox => {
            filters.technique.push(checkbox.dataset.filter);
        });

        document.querySelectorAll('[data-filter-type="occasion"]:checked').forEach(checkbox => {
            filters.occasion.push(checkbox.dataset.filter);
        });

        document.querySelectorAll('[data-filter-type="origin"]:checked').forEach(checkbox => {
            filters.origin.push(checkbox.dataset.filter);
        });

        return filters;
    }

    // Render Recipes - Optimizado con chunked rendering
    renderRecipes() {
        const container = this.getElement('recipesContainer');
        if (!container) {
            console.error('Error: Contenedor recipesContainer no encontrado');
            return;
        }

        if (!this.filteredRecipes || this.filteredRecipes.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <h3>No se encontraron recetas</h3>
                    <p>Intenta ajustar los filtros o tu búsqueda</p>
                </div>
            `;
            return;
        }

        try {
            // Limpiar contenedor
            container.innerHTML = '';
            
            // Para listas grandes, usar chunked rendering
            const CHUNK_SIZE = 12;
            if (this.filteredRecipes.length > CHUNK_SIZE) {
                this.renderChunkedRecipes(container, CHUNK_SIZE);
            } else {
                // Para listas pequeñas, renderizado directo
                const html = this.filteredRecipes.map(recipe => this.createRecipeCard(recipe)).join('');
                container.innerHTML = html;
            }
        } catch (error) {
            console.error('Error al renderizar recetas:', error);
            container.innerHTML = `
                <div class="empty-state">
                    <h3>Error al cargar recetas</h3>
                    <p>Por favor, recarga la página</p>
                </div>
            `;
        }
    }

    // Chunked rendering para recetas con skeleton mejorado
    renderChunkedRecipes(container, chunkSize = 12) {
        let index = 0;
        const total = this.filteredRecipes.length;
        
        // Mostrar skeleton cards mientras carga
        container.innerHTML = `
            <div class="loading-recipes">
                <div class="loading-header">
                    <div class="loading-title">Cargando ${total} recetas...</div>
                    <div class="loading-subtitle">Preparando deliciosos cócteles</div>
                </div>
                <div class="skeleton-grid">
                    ${Array.from({length: Math.min(total, 6)}, (_, i) => `
                        <div class="skeleton-card" style="animation-delay: ${i * 0.1}s">
                            <div class="skeleton-header">
                                <div class="skeleton-title"></div>
                                <div class="skeleton-meta">
                                    <div class="skeleton-badge"></div>
                                    <div class="skeleton-time"></div>
                                </div>
                            </div>
                            <div class="skeleton-content">
                                <div class="skeleton-text skeleton-text-line"></div>
                                <div class="skeleton-text skeleton-text-short"></div>
                                <div class="skeleton-tags">
                                    <div class="skeleton-tag"></div>
                                    <div class="skeleton-tag"></div>
                                    <div class="skeleton-tag"></div>
                                </div>
                            </div>
                            <div class="skeleton-footer">
                                <div class="skeleton-button"></div>
                                <div class="skeleton-button"></div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
        
        const renderNextChunk = () => {
            const fragment = document.createDocumentFragment();
            const endIndex = Math.min(index + chunkSize, total);
            
            for (let i = index; i < endIndex; i++) {
                const recipe = this.filteredRecipes[i];
                const cardHTML = this.createRecipeCard(recipe);
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = cardHTML;
                fragment.appendChild(tempDiv.firstElementChild);
            }
            
            // Limpiar skeleton en primer chunk
            if (index === 0) {
                container.innerHTML = '';
            }
            
            container.appendChild(fragment);
            index = endIndex;
            
            // Continuar con siguiente chunk si quedan recetas
            if (index < total) {
                requestAnimationFrame(renderNextChunk);
            }
        };
        
        // Iniciar renderizado
        requestAnimationFrame(renderNextChunk);
    }

    
    // Recipe Viewer System
    openRecipeViewer(recipeId) {
        const recipe = this.recipes.find(r => r.id === recipeId);
        if (!recipe) {
            return;
        }
        
        this.currentRecipe = recipe;
        this.populateViewer(recipe);
        this.showViewer();
    }

    populateViewer(recipe) {
        document.getElementById('viewerTitle').textContent = recipe.name;
        document.getElementById('viewerRating').innerHTML = `Calificación: ${recipe.rating}`;
        document.getElementById('viewerAlcohol').textContent = recipe.alcohol.charAt(0).toUpperCase() + recipe.alcohol.slice(1);
        document.getElementById('viewerFlavor').textContent = recipe.flavor.charAt(0).toUpperCase() + recipe.flavor.slice(1);
        document.getElementById('viewerDifficulty').textContent = recipe.difficulty.charAt(0).toUpperCase() + recipe.difficulty.slice(1);
        document.getElementById('viewerTime').textContent = recipe.time;
        document.getElementById('viewerTechnique').textContent = recipe.technique.charAt(0).toUpperCase() + recipe.technique.slice(1);
        document.getElementById('viewerGlass').textContent = recipe.glass.charAt(0).toUpperCase() + recipe.glass.slice(1);
        
        // Update favorite button
        const favoriteBtn = document.getElementById('viewerFavorite');
        const isFavorite = this.favorites.includes(recipe.id);
        favoriteBtn.className = `viewer-favorite ${isFavorite ? 'active' : ''}`;
        favoriteBtn.innerHTML = `${isFavorite ? 'Favorito' : 'Agregar'}`;
        
        // Populate ingredients
        this.populateIngredients(recipe);
        
        // Populate instructions
        this.populateInstructions(recipe);
        
        // Setup servings slider
        this.setupServingsSlider();
    }

    populateIngredients(recipe) {
        const container = document.getElementById('viewerIngredients');
        container.innerHTML = recipe.ingredients.map(ing => `
            <div class="ingredient-item">
                <span class="ingredient-amount">${this.parseAmount(ing)}</span>
                <span class="ingredient-name">${this.parseName(ing)}</span>
            </div>
        `).join('');
    }

    populateInstructions(recipe) {
        const container = document.getElementById('viewerInstructions');
        const steps = recipe.instructions.split('.').filter(step => step.trim());
        container.innerHTML = steps.map((step, index) => `
            <div class="instruction-step">
                <div class="step-number">${index + 1}</div>
                <div class="step-text">${step.trim()}.</div>
            </div>
        `).join('');
    }

    setupServingsSlider() {
        const slider = document.getElementById('servingsSlider');
        const value = document.getElementById('servingsValue');
        
        slider.addEventListener('input', (e) => {
            const servings = e.target.value;
            value.textContent = servings;
            this.updateIngredientsForServings(servings);
        });
    }

    updateIngredientsForServings(servings) {
        if (!this.currentRecipe) {
            return;
        }
        
        const container = document.getElementById('viewerIngredients');
        container.innerHTML = this.currentRecipe.ingredients.map(ing => `
            <div class="ingredient-item">
                <span class="ingredient-amount">${this.scaleAmount(ing, servings)}</span>
                <span class="ingredient-name">${this.parseName(ing)}</span>
            </div>
        `).join('');
    }

    parseAmount(ingredient) {
        const match = ingredient.match(/^([\d/]+(?:\s+[\d/]+)*(?:\s+oz)?)\s*(.+)$/);
        return match ? match[1] : ingredient;
    }

    parseName(ingredient) {
        const match = ingredient.match(/^([\d/]+(?:\s+[\d/]+)*(?:\s+oz)?)\s*(.+)$/);
        return match ? match[2] : ingredient;
    }

    scaleAmount(ingredient, servings) {
        const amount = this.parseAmount(ingredient);
        
        // Simple scaling for demo purposes
        if (amount.includes('oz')) {
            const oz = parseFloat(amount.replace('oz', '').trim()) * servings;
            return `${oz} oz`;
        }
        
        return amount;
    }

    showViewer() {
        const viewer = document.getElementById('recipeViewer');
        viewer.classList.add('is-open');
        document.body.style.overflow = 'hidden';
    }

    closeRecipeViewer() {
        const viewer = document.getElementById('recipeViewer');
        viewer.classList.remove('is-open');
        document.body.style.overflow = '';
    }

    toggleViewerFavorite() {
        if (!this.currentRecipe) {
            return;
        }
        this.toggleFavorite(this.currentRecipe.id);
        
        // Update favorite button
        const favoriteBtn = document.getElementById('viewerFavorite');
        const isFavorite = this.favorites.includes(this.currentRecipe.id);
        favoriteBtn.className = `viewer-favorite ${isFavorite ? 'active' : ''}`;
        favoriteBtn.innerHTML = `${isFavorite ? 'Favorito' : 'Agregar'}`;
    }

    viewRecipe(recipeId) {
        this.openRecipeViewer(recipeId);
    }

    createRecipeCard(recipe) {
        // Validar que la receta tenga todos los campos necesarios
        if (!recipe || !recipe.id || !recipe.name || !recipe.description) {
            console.error('Receta inválida:', recipe);
            return '';
        }

        const isFavorite = this.favorites.includes(recipe.id);
        
        // Validar campos opcionales con valores por defecto
        const alcohol = recipe.alcohol || 'desconocido';
        const flavor = recipe.flavor || 'neutro';
        const difficulty = recipe.difficulty || 'fácil';
        const time = recipe.time || '3 min';
        const origin = recipe.origin || 'Desconocido';
        const year = recipe.year || 'N/A';
        const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
        
        try {
            return `
                <article class="recipe-card" data-recipe-id="${recipe.id}">
                    <div class="recipe-header">
                        <div class="recipe-accent"></div>
                        <h3 class="recipe-title">${recipe.name}</h3>
                        <p class="recipe-subtitle">${recipe.description}</p>
                    </div>
                    
                    <div class="recipe-details">
                        <div class="detail-item">
                            <div class="detail-text">
                                <span class="detail-label">Tipo</span>
                                <span class="detail-value">${alcohol.charAt(0).toUpperCase() + alcohol.slice(1)}</span>
                            </div>
                        </div>
                        <div class="detail-item">
                            <div class="detail-text">
                                <span class="detail-label">Sabor</span>
                                <span class="detail-value">${flavor.charAt(0).toUpperCase() + flavor.slice(1)}</span>
                            </div>
                        </div>
                        <div class="detail-item">
                            <div class="detail-text">
                                <span class="detail-label">Dificultad</span>
                                <span class="detail-value">${difficulty.charAt(0).toUpperCase() + difficulty.slice(1)}</span>
                            </div>
                        </div>
                        <div class="detail-item">
                            <div class="detail-text">
                                <span class="detail-label">Tiempo</span>
                                <span class="detail-value">${time}</span>
                            </div>
                        </div>
                    </div>
                    
                    <div class="recipe-ingredients">
                        <h4 class="ingredients-title">Ingredientes principales</h4>
                        <div class="ingredients-list">
                            ${ingredients.slice(0, 3).map(ing => `
                                <span class="ingredient-tag">${ing}</span>
                            `).join('')}
                            ${ingredients.length > 3 ? `<span class="ingredient-tag">+${ingredients.length - 3} más</span>` : ''}
                        </div>
                    </div>
                    
                    <div class="recipe-footer">
                        <div class="recipe-meta">
                            <span>${origin} • ${year}</span>
                        </div>
                        ${recipe.variants && Array.isArray(recipe.variants) && recipe.variants.length > 0 ? `
                            <div class="recipe-variants">
                                <span class="variants-label">Variantes:</span>
                                <div class="variants-list">
                                    ${recipe.variants.map(variantId => {
                                        const variantRecipe = this.recipes.find(r => r.id === variantId);
                                        return variantRecipe ? `
                                            <button class="btn-variant" data-recipe-id="${variantId}" title="Ver ${variantRecipe.name}">
                                                ${variantRecipe.name}
                                            </button>
                                        ` : '';
                                    }).join('')}
                                </div>
                            </div>
                        ` : ''}
                        <div class="recipe-actions">
                            <button class="btn-favorite ${isFavorite ? 'active' : ''}" data-recipe-id="${recipe.id}">
                                ${isFavorite ? 'Favorito' : 'Agregar'}
                            </button>
                            <button class="btn-view" data-recipe-id="${recipe.id}">
                                Ver
                            </button>
                        </div>
                    </div>
                </article>
            `;
        } catch (error) {
            console.error('Error al crear tarjeta de receta:', error, recipe);
            return `
                <article class="recipe-card error">
                    <div class="recipe-header">
                        <h3 class="recipe-title">Error en receta</h3>
                        <p class="recipe-subtitle">No se puede mostrar esta receta</p>
                    </div>
                </article>
            `;
        }
    }

// ... (rest of the code remains the same)
    loadCourses() {
        if (!this.canUseCookies()) {
            this.courseProgress = {};
            return;
        }
        const saved = localStorage.getItem(this.coursesKey);
        this.courseProgress = saved ? JSON.parse(saved) : {};
    }

    saveCourses() {
        if (!this.canUseCookies()) {
            this.showNotification('No se pueden guardar cursos sin aceptar cookies', 'warning');
            return;
        }
        localStorage.setItem(this.favoritesKey, JSON.stringify(this.favorites));
    }

    toggleFavorite(recipeId) {
        const index = this.favorites.indexOf(recipeId);
        if (index > -1) {
            this.favorites.splice(index, 1);
            this.showNotification('Receta eliminada de favoritos', 'remove');
        } else {
            this.favorites.push(recipeId);
            this.showNotification('Receta agregada a favoritos', 'add');
        }
        this.saveFavorites();
        this.updateFavoritesSection();
        this.updateFavoritesCounter();
    }

    updateFavoritesSection() {
        const favoritesContainer = document.getElementById('favoritesContainer');
        const favoritesCount = document.getElementById('favoritesCount');
        const favoritesFiltered = document.getElementById('favoritesFiltered');
        
        if (!favoritesContainer) return;

        // Obtener recetas favoritas
        let favoriteRecipes = this.recipes.filter(recipe => this.favorites.includes(recipe.id));
        
        // Aplicar búsqueda
        const searchInput = document.getElementById('favoritesSearch');
        if (searchInput && searchInput.value.trim()) {
            const query = searchInput.value.toLowerCase().trim();
            favoriteRecipes = favoriteRecipes.filter(recipe =>
                recipe.name.toLowerCase().includes(query) ||
                recipe.description.toLowerCase().includes(query) ||
                recipe.ingredients.some(ing => ing.toLowerCase().includes(query))
            );
        }
        
        // Aplicar filtros
        const alcoholFilter = document.getElementById('favoritesFilterAlcohol');
        const flavorFilter = document.getElementById('favoritesFilterFlavor');
        
        if (alcoholFilter && alcoholFilter.value) {
            favoriteRecipes = favoriteRecipes.filter(recipe => recipe.alcohol === alcoholFilter.value);
        }
        if (flavorFilter && flavorFilter.value) {
            favoriteRecipes = favoriteRecipes.filter(recipe => recipe.flavor === flavorFilter.value);
        }
        
        // Aplicar ordenamiento
        const sortSelect = document.getElementById('favoritesSort');
        if (sortSelect) {
            const sortValue = sortSelect.value;
            switch (sortValue) {
                case 'name':
                    favoriteRecipes.sort((a, b) => a.name.localeCompare(b.name));
                    break;
                case 'rating':
                    favoriteRecipes.sort((a, b) => b.rating - a.rating);
                    break;
                case 'difficulty':
                    const diffOrder = { 'fácil': 1, 'medio': 2, 'difícil': 3 };
                    favoriteRecipes.sort((a, b) => diffOrder[a.difficulty] - diffOrder[b.difficulty]);
                    break;
                case 'recent':
                    // Ordenar por ID (asumiendo que los IDs más recientes están al final)
                    favoriteRecipes.reverse();
                    break;
            }
        }
        
        // Actualizar estadísticas
        const totalFavorites = this.favorites.length;
        if (favoritesCount) {
            favoritesCount.textContent = `${totalFavorites} receta${totalFavorites !== 1 ? 's' : ''} guardada${totalFavorites !== 1 ? 's' : ''}`;
        }
        if (favoritesFiltered) {
            const showing = favoriteRecipes.length;
            if (showing === totalFavorites) {
                favoritesFiltered.textContent = 'Mostrando todas';
            } else {
                favoritesFiltered.textContent = `Mostrando ${showing} de ${totalFavorites}`;
            }
        }
        
        // Renderizar
        if (favoriteRecipes.length === 0) {
            if (this.favorites.length === 0) {
                favoritesContainer.innerHTML = `
                    <div class="empty-favorites">
                        <div class="empty-icon"></div>
                        <h3>No tienes recetas favoritas</h3>
                        <p>Agrega tus recetas preferidas para verlas aquí</p>
                        <button class="btn-primary" onclick="app.goTo('recetas')">Explorar recetas</button>
                    </div>
                `;
            } else {
                favoritesContainer.innerHTML = `
                    <div class="empty-favorites">
                        <div class="empty-icon"></div>
                        <h3>No se encontraron resultados</h3>
                        <p>Ajusta los filtros o la búsqueda</p>
                        <button class="btn-primary" onclick="app.resetFavoritesFilters()">Limpiar filtros</button>
                    </div>
                `;
            }
            return;
        }

        favoritesContainer.innerHTML = `
            <div class="favorites-grid">
                ${favoriteRecipes.map(recipe => this.createFavoriteCard(recipe)).join('')}
            </div>
        `;
    }

    resetFavoritesFilters() {
        const searchInput = document.getElementById('favoritesSearch');
        const alcoholFilter = document.getElementById('favoritesFilterAlcohol');
        const flavorFilter = document.getElementById('favoritesFilterFlavor');
        const sortSelect = document.getElementById('favoritesSort');
        
        if (searchInput) searchInput.value = '';
        if (alcoholFilter) alcoholFilter.value = '';
        if (flavorFilter) flavorFilter.value = '';
        if (sortSelect) sortSelect.value = 'name';
        
        this.updateFavoritesSection();
    }

    bindFavoritesControls() {
        // Búsqueda
        const searchInput = document.getElementById('favoritesSearch');
        if (searchInput) {
            let searchTimeout;
            
            searchInput.addEventListener('input', () => {
                clearTimeout(searchTimeout);
                searchTimeout = setTimeout(() => {
                    this.updateFavoritesSection();
                }, 200);
            });

            // Mobile-specific improvements
            searchInput.addEventListener('focus', () => {
                if (window.innerWidth <= 768) {
                    setTimeout(() => {
                        searchInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }, 100);
                }
            });

            // Clear on escape
            searchInput.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    searchInput.value = '';
                    this.updateFavoritesSection();
                    searchInput.blur();
                }
            });
        }
        
        // Filtros
        const alcoholFilter = document.getElementById('favoritesFilterAlcohol');
        const flavorFilter = document.getElementById('favoritesFilterFlavor');
        const sortSelect = document.getElementById('favoritesSort');
        
        if (alcoholFilter) {
            alcoholFilter.addEventListener('change', () => this.updateFavoritesSection());
        }
        if (flavorFilter) {
            flavorFilter.addEventListener('change', () => this.updateFavoritesSection());
        }
        if (sortSelect) {
            sortSelect.addEventListener('change', () => this.updateFavoritesSection());
        }
        
        // Botón limpiar todo
        const clearBtn = document.getElementById('clearAllFavorites');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => this.clearAllFavorites());
        }
    }

    createFavoriteCard(recipe) {
        // Validar que la receta tenga todos los campos necesarios
        if (!recipe || !recipe.id || !recipe.name || !recipe.description) {
            console.error('Receta inválida:', recipe);
            return '';
        }

        const isFavorite = this.favorites.includes(recipe.id);
        
        // Validar campos opcionales con valores por defecto
        const alcohol = recipe.alcohol || 'desconocido';
        const flavor = recipe.flavor || 'neutro';
        const difficulty = recipe.difficulty || 'fácil';
        const time = recipe.time || '3 min';
        const origin = recipe.origin || 'Desconocido';
        const year = recipe.year || 'N/A';
        const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
        
        try {
            return `
                <article class="recipe-card" data-recipe-id="${recipe.id}">
                    <div class="recipe-header">
                        <div class="recipe-accent"></div>
                        <h3 class="recipe-title">${recipe.name}</h3>
                        <p class="recipe-subtitle">${recipe.description}</p>
                    </div>
                    
                    <div class="recipe-details">
                        <div class="detail-item">
                            <div class="detail-text">
                                <span class="detail-label">Tipo</span>
                                <span class="detail-value">${alcohol.charAt(0).toUpperCase() + alcohol.slice(1)}</span>
                            </div>
                        </div>
                        <div class="detail-item">
                            <div class="detail-text">
                                <span class="detail-label">Sabor</span>
                                <span class="detail-value">${flavor.charAt(0).toUpperCase() + flavor.slice(1)}</span>
                            </div>
                        </div>
                        <div class="detail-item">
                            <div class="detail-text">
                                <span class="detail-label">Dificultad</span>
                                <span class="detail-value">${difficulty.charAt(0).toUpperCase() + difficulty.slice(1)}</span>
                            </div>
                        </div>
                        <div class="detail-item">
                            <div class="detail-text">
                                <span class="detail-label">Tiempo</span>
                                <span class="detail-value">${time}</span>
                            </div>
                        </div>
                    </div>
                    
                    <div class="recipe-ingredients">
                        <h4 class="ingredients-title">Ingredientes principales</h4>
                        <div class="ingredients-list">
                            ${ingredients.slice(0, 3).map(ing => `
                                <span class="ingredient-tag">${ing}</span>
                            `).join('')}
                            ${ingredients.length > 3 ? `<span class="ingredient-tag">+${ingredients.length - 3} más</span>` : ''}
                        </div>
                    </div>
                    
                    <div class="recipe-footer">
                        <div class="recipe-meta">
                            <span>${origin} • ${year}</span>
                        </div>
                        ${recipe.variants && Array.isArray(recipe.variants) && recipe.variants.length > 0 ? `
                            <div class="recipe-variants">
                                <span class="variants-label">Variantes:</span>
                                <div class="variants-list">
                                    ${recipe.variants.map(variantId => {
                                        const variantRecipe = this.recipes.find(r => r.id === variantId);
                                        return variantRecipe ? `
                                            <button class="btn-variant" data-recipe-id="${variantId}" title="Ver ${variantRecipe.name}">
                                                ${variantRecipe.name}
                                            </button>
                                        ` : '';
                                    }).join('')}
                                </div>
                            </div>
                        ` : ''}
                        <div class="recipe-actions">
                            <button class="btn-favorite ${isFavorite ? 'active' : ''}" data-recipe-id="${recipe.id}">
                                ${isFavorite ? 'Favorito' : 'Agregar'}
                            </button>
                            <button class="btn-view" data-recipe-id="${recipe.id}">
                                Ver
                            </button>
                        </div>
                    </div>
                </article>
            `;
        } catch (error) {
            console.error('Error al crear tarjeta de receta favorita:', error, recipe);
            return `
                <article class="recipe-card error">
                    <div class="recipe-header">
                        <h3 class="recipe-title">Error en receta</h3>
                        <p class="recipe-subtitle">No se puede mostrar esta receta</p>
                    </div>
                </article>
            `;
        }
    }

    updateFavoritesCounter() {
        const counter = document.getElementById('favoritesCounter');
        if (counter) {
            const count = this.favorites.length;
            counter.textContent = count;
            if (count > 0) {
                counter.style.display = 'flex';
                counter.classList.add('show');
            } else {
                counter.style.display = 'none';
                counter.classList.remove('show');
            }
        }
    }

    clearAllFavorites() {
        if (confirm('¿Estás seguro de que quieres eliminar todas tus recetas favoritas?')) {
            this.favorites = [];
            this.saveFavorites();
            this.updateFavoritesSection();
            this.updateFavoritesCounter();
            this.renderRecipes();
            this.showNotification('Todas las recetas favoritas han sido eliminadas', 'remove');
        }
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.classList.add('show');
        }, 100);
        
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => {
                document.body.removeChild(notification);
            }, 300);
        }, 3000);
    }

    // Recipe Page System
    openRecipePage(recipeId, opts = {}) {
        const recipe = this.recipes.find(r => r.id === recipeId);
        if (!recipe) {
            this.goTo('recetas');
            return;
        }
        
        this.currentRecipe = recipe;
        this.renderRecipePage(recipe);
        this.goTo('receta', opts);
        
        if (opts.updateHash !== false) {
            history.replaceState(null, '', `#recetas/${recipeId}`);
        }
    }

    renderRecipePage(recipe) {
        const container = document.getElementById('recipePageContainer');
        if (!container) {
            return;
        }

        const recipeIndex = this.recipes.findIndex(r => r.id === recipe.id);
        const prevRecipe = recipeIndex > 0 ? this.recipes[recipeIndex - 1] : null;
        const nextRecipe = recipeIndex < this.recipes.length - 1 ? this.recipes[recipeIndex + 1] : null;
        
        const isFavorite = this.favorites.includes(recipe.id);

        container.innerHTML = `
            <div class="recipe-page-header">
                <div class="recipe-navigation">
                    ${prevRecipe ? `
                        <button class="nav-btn prev-btn" data-recipe-id="${prevRecipe.id}">
                            ← ${prevRecipe.name}
                        </button>
                    ` : '<div></div>'}
                    
                    <div class="recipe-actions-header">
                        <button class="btn-favorite ${isFavorite ? 'active' : ''}" data-recipe-id="${recipe.id}">
                            ${isFavorite ? 'Favorito' : 'Agregar a favoritos'}
                        </button>
                        <button class="btn-back">← Volver a recetas</button>
                    </div>
                    
                    ${nextRecipe ? `
                        <button class="nav-btn next-btn" data-recipe-id="${nextRecipe.id}">
                            ${nextRecipe.name} →
                        </button>
                    ` : '<div></div>'}
                </div>
            </div>
            
            <div class="recipe-page-content">
                <div class="recipe-hero">
                    <div class="recipe-title-section">
                        <h1 class="recipe-page-title">${recipe.name}</h1>
                        <div class="recipe-meta">
                            <span class="recipe-rating">Calificación: ${recipe.rating}</span>
                            <span class="recipe-origin">Origen: ${recipe.origin}</span>
                            <span class="recipe-alcohol">Alcohol: ${recipe.alcohol.charAt(0).toUpperCase() + recipe.alcohol.slice(1)}</span>
                            <span class="recipe-year">Año: ${recipe.year}</span>
                        </div>
                    </div>
                </div>

                <div class="recipe-description">
                    <h2>Historia y Origen</h2>
                    <p>${recipe.description}</p>
                </div>

                <div class="recipe-details-grid">
                    <div class="recipe-ingredients-section">
                        <h2>Ingredientes</h2>
                        <div class="ingredients-list">
                            ${recipe.ingredients.map(ing => `
                                <div class="ingredient-item">
                                    <span class="ingredient-name">${ing}</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>

                    <div class="recipe-info-section">
                        <h2>Información</h2>
                        <div class="info-grid">
                            <div class="info-item">
                                <span class="info-label">Sabor:</span>
                                <span class="info-value">${recipe.flavor.charAt(0).toUpperCase() + recipe.flavor.slice(1)}</span>
                            </div>
                            <div class="info-item">
                                <span class="info-label">Dificultad:</span>
                                <span class="info-value">${recipe.difficulty.charAt(0).toUpperCase() + recipe.difficulty.slice(1)}</span>
                            </div>
                            <div class="info-item">
                                <span class="info-label">Vaso:</span>
                                <span class="info-value">${recipe.glass.charAt(0).toUpperCase() + recipe.glass.slice(1)}</span>
                            </div>
                            <div class="info-item">
                                <span class="info-label">Técnica:</span>
                                <span class="info-value">${recipe.technique.charAt(0).toUpperCase() + recipe.technique.slice(1)}</span>
                            </div>
                            <div class="info-item">
                                <span class="info-label">Tiempo:</span>
                                <span class="info-value">${recipe.time}</span>
                            </div>
                            <div class="info-item">
                                <span class="info-label">Ocasión:</span>
                                <span class="info-value">${recipe.occasion.charAt(0).toUpperCase() + recipe.occasion.slice(1)}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="recipe-instructions">
                    <h2>Instrucciones Paso a Paso</h2>
                    <div class="instructions-content">
                        ${recipe.instructions.split('PASO').filter(step => step.trim()).map((step, index) => {
                            if (step.trim()) {
                                const [instruction, ...consejos] = step.split('CONSEJOS:');
                                return `
                                    <div class="instruction-step">
                                        <div class="step-number">${index + 1}</div>
                                        <div class="step-content">
                                            <p class="step-text">PASO${instruction.trim()}</p>
                                            ${consejos.length > 0 ? `
                                                <div class="step-tips">
                                                    <strong>CONSEJOS:</strong>${consejos.join('')}
                                                </div>
                                            ` : ''}
                                        </div>
                                    </div>
                                `;
                            }
                            return '';
                        }).join('')}
                    </div>
                </div>
            </div>
        </div>
        `;
    }

    goTo(id, opts = {}) {
        const { updateHash = true } = opts;

        // Cambiar sección activa
        document.querySelectorAll('.panel').forEach(panel => {
            panel.classList.remove('is-active');
        });
        
        const targetPanel = document.getElementById(id);
        if (targetPanel) {
            targetPanel.classList.add('is-active');
            // Forzar scroll al inicio absoluto de la página
            window.scrollTo(0, 0);
        }

        // Actualizar enlaces de navegación activos
        document.querySelectorAll('.nav__link, .bottomnav__link').forEach(a => {
            a.classList.toggle('is-active', a.getAttribute('data-section') === id);
        });
        
        document.querySelectorAll(`[data-section="${id}"]`).forEach(link => {
            link.classList.add('is-active');
        });
        
        // Guardar sección actual
        sessionStorage.setItem('currentSection', id);
        
        // Actualizar hash si es necesario
        if (updateHash) {
            history.replaceState(null, '', `#${id}`);
        }
    }

    initDynamicTitles() {
        // Establecer título inicial basado en la sección actual
        const currentSection = this.getCurrentSection();
        this.updatePageTitle(currentSection);
        
        // Actualizar título cuando cambie la sección
        this.observeSectionChanges();
    }

    getCurrentSection() {
        const activePanel = document.querySelector('.panel.is-active');
        return activePanel ? activePanel.id : 'inicio';
    }

    updatePageTitle(sectionId) {
        const titleMap = {
            'inicio': 'BARMASTER - Tu Compañero Definitivo en el Arte de la Mixología',
            'recetas': 'Recetas de Cócteles - BARMASTER | Guía Completa de Mixología',
            'favoritos': 'Mis Cócteles Favoritos - BARMASTER | Recetas Guardadas',
            'receta': 'Receta de Cóctel - BARMASTER | Instrucciones Detalladas',
            'historia': 'Historia de la Mixología - BARMASTER | 9000 Años de Evolución',
            'acerca': 'Acerca de BARMASTER | Plataforma Líder en Educación de Mixología',
            'historia-detallada': 'Historia Completa del Alcohol - BARMASTER | 9000 Años de Evolución Cultural',
            'tecnicas-destilacion': 'Técnicas de Destilación - BARMASTER | El Arte y la Ciencia',
            'whisky-guia': 'Guía Completa de Whisky - BARMASTER | Todo sobre el Agua de Vida',
            'tecnicas-whisky': 'Técnicas de Elaboración de Whisky - BARMASTER | Proceso Detallado',
            'vinos-europeos': 'Vinos Europeos Clásicos - BARMASTER | Grandes Regiones Vinícolas',
            'brandy-cognac': 'Brandy y Cognac - BARMASTER | El Arte de Destilar Vino',
            'gin-historia': 'Historia Completa del Gin - BARMASTER | Desde Holanda hasta el Mundo',
            'gin-clasico': 'Gin Clásico Inglés - BARMASTER | London Dry Gin y Variantes',
            'rum-historia': 'Historia Completa del Rum - BARMASTER | El Espíritu del Caribe',
            'rum-caribe': 'Rum del Caribe - BARMASTER | Las Islas del Ron',
            'cocktail-historia': 'Historia de los Cócteles - BARMASTER | El Arte de Mezclar Bebidas',
            'cocktail-clasicos': 'Cócteles Clásicos - BARMASTER | Recetas que Definieron la Mixología',
            'jerry-thomas': 'Vida y Obra de Jerry Thomas - BARMASTER | Padre de la Mixología Moderna',
            'mixologia-clasica': 'Mixología Clásica - BARMASTER | Técnicas y Principios Fundamentales'
        };
        
        const title = titleMap[sectionId] || 'BARMASTER - Tu Compañero Definitivo en el Arte de la Mixología';
        document.title = title;
        
        // Actualizar meta descripción también para mejor SEO
        this.updateMetaDescription(sectionId);
    }

    updateMetaDescription(sectionId) {
        const descriptionMap = {
            'inicio': 'BARMASTER: tu plataforma definitiva para aprender el arte de la mixología. Recetas profesionales, técnicas avanzadas y la historia completa de los cócteles.',
            'recetas': 'Explora nuestra colección completa de recetas de cócteles profesionales. Desde clásicos atemporales hasta creaciones modernas con instrucciones detalladas.',
            'favoritos': 'Tus cócteles favoritos guardados en BARMASTER. Accede rápido a tus recetas preferidas y personaliza tu colección personal.',
            'receta': 'Receta detallada de cóctel con instrucciones paso a paso, ingredientes exactos y consejos profesionales de mixología.',
            'historia': 'Descubre 9000 años de historia del alcohol y la mixología. Desde las primeras fermentaciones hasta los cócteles modernos.',
            'acerca': 'BARMASTER es la plataforma líder en educación y recursos para profesionales de la mixología. Aprende de los mejores expertos.',
            'historia-detallada': 'Explora 9000 años de evolución cultural y tecnológica del alcohol. Desde las primeras civilizaciones hasta la industria moderna.',
            'tecnicas-destilacion': 'Aprende las técnicas de destilación profesional. El arte y la ciencia de separar alcohol para crear espiritus excepcionales.',
            'whisky-guia': 'Guía completa de whisky: desde su origen hasta las mejores marcas. Todo sobre el agua de vida más prestigiosa del mundo.',
            'tecnicas-whisky': 'Conoce el proceso completo de elaboración del whisky. Desde la malta hasta el embotellado, cada paso detallado.',
            'vinos-europeos': 'Descubre las grandes regiones vinícolas europeas. Desde Burdeos hasta la Toscana, la tradición del vino viejo mundo.',
            'brandy-cognac': 'El arte de destilar vino para crear brandy y cognac. Técnicas tradicionales y los mejores productores del mundo.',
            'gin-historia': 'La historia completa del gin: desde su creación en Holanda hasta convertirse en el espíritu preferido de los cócteles modernos.',
            'gin-clasico': 'London Dry Gin y sus variantes clásicas. El gin inglés tradicional y su influencia en la mixología mundial.',
            'rum-historia': 'El espíritu del Caribe: historia completa del rum. Desde las plantaciones de azúcar hasta los cócteles tropicales.',
            'rum-caribe': 'Las islas del ron: explora las diferentes variedades de rum caribeño y sus características únicas por región.',
            'cocktail-historia': 'El arte de mezclar bebidas: historia de los cócteles. Desde los primeros bares hasta los cócteles moleculares modernos.',
            'cocktail-clasicos': 'Las recetas que definieron la mixología. Cócteles clásicos atemporales que todo bartender debe conocer.',
            'jerry-thomas': 'El padre de la mixología moderna. Vida y obra de Jerry Thomas, el bartender que revolucionó los cócteles.',
            'mixologia-clasica': 'Técnicas y principios fundamentales de la mixología clásica. Las bases esenciales para todo bartender profesional.'
        };
        
        const description = descriptionMap[sectionId] || 'BARMASTER: tu plataforma definitiva para aprender el arte de la mixología.';
        
        // Actualizar o crear meta description
        let metaDesc = document.querySelector('meta[name="description"]');
        if (!metaDesc) {
            metaDesc = document.createElement('meta');
            metaDesc.name = 'description';
            document.head.appendChild(metaDesc);
        }
        metaDesc.content = description;
    }

    observeSectionChanges() {
        // Observar cambios en las clases de los paneles para actualizar títulos dinámicamente
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                    const target = mutation.target;
                    if (target.classList.contains('panel') && target.classList.contains('is-active')) {
                        this.updatePageTitle(target.id);
                    }
                }
            });
        });

        // Observar todos los paneles
        document.querySelectorAll('.panel').forEach(panel => {
            observer.observe(panel, { attributes: true, attributeFilter: ['class'] });
        });
    }

    showContentSection(sectionId) {
        // Hide all panels
        document.querySelectorAll('.panel').forEach(panel => {
            panel.classList.remove('is-active');
        });
        
        // Show the target content section
        const targetSection = document.getElementById(sectionId);
        if (targetSection) {
            targetSection.classList.add('is-active');
            targetSection.style.display = 'block';
            
            // Scroll to top of the section
            targetSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
            
            // Update hash without triggering navigation
            history.replaceState(null, '', `#${sectionId}`);
        }
    }

    routeFromHash() {
        const hash = window.location.hash.slice(1);
        
        // Si no hay hash, intentar restaurar desde sessionStorage
        if (!hash) {
            const savedSection = sessionStorage.getItem('barmaster-current-section');
            if (savedSection && this.sectionIds.includes(savedSection)) {
                // Restaurar la sección guardada
                this.goTo(savedSection, { updateHash: true });
                return;
            } else {
                // Si no hay sección guardada, ir a inicio
                this.goTo('inicio', { updateHash: false });
                return;
            }
        }
        
        // Handle content sections (timeline links)
        const contentSection = document.getElementById(hash);
        if (contentSection && contentSection.style.display === 'none') {
            this.showContentSection(hash);
            return;
        }
        
        // Handle recipe page URLs like #recetas/recipe-id
        if (hash.startsWith('recetas/')) {
            const recipeId = hash.split('/')[1];
            if (recipeId) {
                this.openRecipePage(recipeId, { updateHash: false });
            } else {
                this.goTo('recetas', { updateHash: false });
            }
            return;
        }
        
        // Handle regular panel URLs
        if (this.sectionIds.includes(hash)) {
            this.goTo(hash, { updateHash: false });
        } else {
            // Si el hash no es válido, ir a inicio
            this.goTo('inicio', { updateHash: false });
        }
    }

    initializeGlobalEvents() {
        const self = this;
        document.addEventListener('click', (e) => {
            // Handle brand link
            if (e.target.matches('.brand') || e.target.closest('.brand')) {
                e.preventDefault();
                const target = e.target.closest('.brand');
                const section = target.getAttribute('data-section');
                if (section) {
                    self.goTo(section);
                }
            }
            
            // Handle navigation links
            if (e.target.matches('.nav__link, .bottomnav__link') || e.target.closest('.nav__link, .bottomnav__link')) {
                const target = e.target.closest('.nav__link, .bottomnav__link') || e.target;
                const href = target.getAttribute('href');
                const section = target.getAttribute('data-section');
                
                // Allow external links (like legal.html) to work normally
                if (href && (href.includes('.html') || href.startsWith('http'))) {
                    return; // Don't prevent default, let the link work normally
                }
                
                // Handle internal section navigation
                e.preventDefault();
                if (section) {
                    self.goTo(section);
                }
            }
            
            // Handle clicks on spans within bottomnav links
            if (e.target.matches('.bottomnav__link span') || e.target.closest('.bottomnav__link span')) {
                const linkElement = e.target.closest('.bottomnav__link');
                const href = linkElement.getAttribute('href');
                const section = linkElement.getAttribute('data-section');
                
                // Allow external links (like legal.html) to work normally
                if (href && (href.includes('.html') || href.startsWith('http'))) {
                    return; // Don't prevent default, let the link work normally
                }
                
                // Handle internal section navigation
                e.preventDefault();
                if (section) {
                    self.goTo(section);
                }
            }
            
            // Handle timeline internal links
            if (e.target.matches('.timeline-link')) {
                e.preventDefault();
                const targetId = e.target.getAttribute('href');
                if (targetId && targetId.startsWith('#')) {
                    self.showContentSection(targetId.substring(1));
                }
            }
            
            // Handle recipe cards (delegated)
            if (e.target.closest('.recipe-card') && !e.target.closest('.recipe-actions')) {
                const card = e.target.closest('.recipe-card');
                const recipeId = card.dataset.recipeId;
                if (recipeId) {
                    self.openRecipePage(recipeId);
                }
            }
            
            // Handle favorite buttons (delegated)
            if (e.target.matches('.btn-favorite, .btn-toggle-favorite')) {
                e.preventDefault();
                e.stopPropagation();
                const recipeId = e.target.getAttribute('data-recipe-id') || 
                               e.target.closest('.recipe-card')?.dataset.recipeId ||
                               e.target.closest('.favorite-card')?.dataset.recipeId;
                if (recipeId) {
                    self.toggleFavorite(recipeId);
                    // Update button immediately without re-rendering everything
                    const isFavorite = self.favorites.includes(recipeId);
                    const clickedButton = e.target;
                    clickedButton.classList.toggle('active', isFavorite);
                    clickedButton.textContent = isFavorite ? 'Favorito' : 'Agregar';
                    
                    // Update other instances of the same button
                    document.querySelectorAll(`[data-recipe-id="${recipeId}"].btn-favorite, [data-recipe-id="${recipeId}"].btn-toggle-favorite`).forEach(btn => {
                        if (btn !== clickedButton) {
                            btn.classList.toggle('active', isFavorite);
                            btn.textContent = isFavorite ? 'Favorito' : 'Agregar';
                        }
                    });
                }
            }
            
            // Handle remove favorite buttons (delegated)
            if (e.target.matches('.btn-remove-favorite')) {
                e.preventDefault();
                e.stopPropagation();
                const recipeId = e.target.getAttribute('data-recipe-id') || 
                               e.target.closest('.favorite-card')?.dataset.recipeId;
                if (recipeId) {
                    self.toggleFavorite(recipeId);
                }
            }
            
            // Handle view favorite buttons (delegated)
            if (e.target.matches('.btn-view-favorite')) {
                e.preventDefault();
                e.stopPropagation();
                const recipeId = e.target.getAttribute('data-recipe-id') || 
                               e.target.closest('.favorite-card')?.dataset.recipeId;
                if (recipeId) {
                    self.openRecipePage(recipeId);
                }
            }
            
            // Handle view buttons (delegated)
            if (e.target.matches('.btn-view')) {
                e.preventDefault();
                e.stopPropagation();
                const recipeId = e.target.getAttribute('data-recipe-id') || 
                               e.target.closest('.recipe-card')?.dataset.recipeId;
                if (recipeId) {
                    self.openRecipePage(recipeId);
                }
            }
            
            // Handle variant buttons (delegated)
            if (e.target.matches('.btn-variant')) {
                e.preventDefault();
                e.stopPropagation();
                const recipeId = e.target.getAttribute('data-recipe-id');
                if (recipeId) {
                    self.openRecipePage(recipeId);
                }
            }
            
            // Handle back buttons (delegated)
            if (e.target.matches('.btn-back')) {
                e.preventDefault();
                self.goTo('recetas');
            }
            
            // Handle navigation buttons in recipe pages (delegated)
            if (e.target.matches('.nav-btn')) {
                e.preventDefault();
                const recipeId = e.target.getAttribute('data-recipe-id');
                if (recipeId) {
                    self.openRecipePage(recipeId);
                }
            }
        });
        
        // Handle search input
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                self.handleSearch(e.target.value);
            });
        }
        
        // Handle filter changes
        document.addEventListener('change', (e) => {
            if (e.target.matches('.filter-item input[type="checkbox"]')) {
                self.applyFilters();
            }
        });
    }
}

// Timeline Navigation Functions
function scrollTimeline(direction) {
    const timeline = document.querySelector('.timeline-container');
    if (!timeline) return;
    
    if (direction === 'start') {
        timeline.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (direction === 'end') {
        timeline.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
}

// Initialize the application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Create app instance only when DOM is ready
    window.app = new Barmaster();
    
    // Initialize global event listeners
    window.app.initializeGlobalEvents();
    
    // Renderizar recetas inicialmente
    window.app.lazyLoadRecipes();
    
    // Forzar renderizado si estamos en sección de recetas
    setTimeout(() => {
        const currentSection = window.location.hash.replace('#', '') || 'inicio';
        if (currentSection === 'recetas') {
            window.app.renderRecipes();
        }
    }, 100);
    
    // Renderizado diferido de secciones secundarias
    requestIdleCallback(() => {
        if (window.app.favorites.length > 0) {
            window.app.updateFavoritesSection();
        }
        window.app.updateSearchStats();
    });
    
    // Add viewer close event listener
    const viewerClose = document.getElementById('viewerClose');
    if (viewerClose) {
        viewerClose.addEventListener('click', () => {
            window.app.closeRecipeViewer();
        });
    }

    const viewerFavorite = document.getElementById('viewerFavorite');
    if (viewerFavorite) {
        viewerFavorite.addEventListener('click', () => {
            window.app.toggleViewerFavorite();
        });
    }

    const servingsSlider = document.getElementById('servingsSlider');
    const servingsValue = document.getElementById('servingsValue');
    if (servingsSlider && servingsValue) {
        servingsSlider.addEventListener('input', (e) => {
            servingsValue.textContent = e.target.value;
            if (window.app.currentRecipe) {
                window.app.populateIngredients(window.app.currentRecipe);
            }
        });
    }

    // Initialize History Search functionality
    initializeHistorySearch();
});

// History Search Functionality - Professional Version
function initializeHistorySearch() {
    const searchInput = document.getElementById('historySearch');
    const clearButton = document.getElementById('clearHistorySearch');
    const statsElement = document.getElementById('historySearchStats');
    const toggleFiltersBtn = document.getElementById('toggleFilters');
    const filtersPanel = document.getElementById('historyFilters');
    const applyFiltersBtn = document.getElementById('applyFilters');
    const resetFiltersBtn = document.getElementById('resetFilters');
    const sortSelect = document.getElementById('sortHistory');
    const dateFrom = document.getElementById('dateFrom');
    const dateTo = document.getElementById('dateTo');
    
    if (!searchInput) return;

    const allCards = document.querySelectorAll('.history-card');
    const totalCards = allCards.length;
    let currentSort = 'date-asc';

    // Define era and drink type mappings
    const eraMapping = {
        'antigua': [0, 1, 2, 3, 4, 5, 6], // indices of ancient era cards
        'media': [7, 8, 9, 10], // indices of medieval cards
        'moderna': [11, 12, 13, 14, 15], // indices of modern era cards
        'actual': [16, 17, 18, 19, 20, 21, 22, 23] // indices of 20th-21st century cards
    };

    // Toggle filters panel
    if (toggleFiltersBtn && filtersPanel) {
        toggleFiltersBtn.addEventListener('click', () => {
            const isVisible = filtersPanel.style.display !== 'none';
            filtersPanel.style.display = isVisible ? 'none' : 'block';
            toggleFiltersBtn.classList.toggle('active', !isVisible);
        });
    }

    // Get active filters
    function getActiveFilters() {
        const eras = Array.from(document.querySelectorAll('.filter-group:first-child .filter-chip input:checked')).map(cb => cb.value);
        const drinkTypes = Array.from(document.querySelectorAll('.filter-group:nth-child(2) .filter-chip input:checked')).map(cb => cb.value);
        const fromDate = dateFrom?.value || 'all';
        const toDate = dateTo?.value || '2024';
        return { eras, drinkTypes, fromDate, toDate };
    }

    // Parse year from card
    function parseYear(card) {
        const yearText = card.querySelector('.card-year')?.textContent || '';
        // Handle various formats like "7000 a.C.", "200 d.C.", "1920"
        if (yearText.includes('a.C.')) {
            return -parseInt(yearText.replace(/[^0-9]/g, ''));
        } else if (yearText.includes('d.C.')) {
            return parseInt(yearText.replace(/[^0-9]/g, ''));
        } else {
            return parseInt(yearText.replace(/[^0-9]/g, '')) || 0;
        }
    }

    // Check if card matches drink type
    function matchesDrinkType(card, drinkTypes) {
        if (drinkTypes.length === 0) return true;
        const text = (card.querySelector('.card-title')?.textContent + ' ' + 
                     card.querySelector('.card-desc')?.textContent).toLowerCase();
        
        const typeKeywords = {
            'cerveza': ['cerveza', 'beer', 'brewing', 'cervecería'],
            'vino': ['vino', 'wine', 'vid', 'viticultura', 'viñedo'],
            'destilados': ['destilación', 'whisky', 'ron', 'gin', 'vodka', 'alambique', 'licor'],
            'cocteles': ['cóctel', 'cocktail', 'mixología', 'bartender', 'bar'],
            'otros': ['hidromiel', 'mead', 'tequila', 'cachaça', 'sake']
        };

        return drinkTypes.some(type => 
            typeKeywords[type]?.some(keyword => text.includes(keyword))
        );
    }

    // Main filter and search function
    function performSearch(query) {
        const normalizedQuery = query.toLowerCase().trim();
        const { eras, drinkTypes, fromDate, toDate } = getActiveFilters();
        let visibleCount = 0;

        allCards.forEach((card, index) => {
            const year = parseYear(card);
            const cardYearText = card.querySelector('.card-year')?.textContent || '';
            const title = card.querySelector('.card-title')?.textContent || '';
            const desc = card.querySelector('.card-desc')?.textContent || '';
            const tags = Array.from(card.querySelectorAll('.card-tags span')).map(tag => tag.textContent).join(' ');
            
            const searchText = `${cardYearText} ${title} ${desc} ${tags}`.toLowerCase();
            
            // Check text search
            const matchesText = normalizedQuery === '' || searchText.includes(normalizedQuery);
            
            // Check era filter
            let matchesEra = eras.length === 0;
            for (const [era, indices] of Object.entries(eraMapping)) {
                if (eras.includes(era) && indices.includes(index)) {
                    matchesEra = true;
                    break;
                }
            }
            
            // Check drink type filter
            const matchesDrink = drinkTypes.length === 0 || matchesDrinkType(card, drinkTypes);
            
            // Check date range
            const fromYear = fromDate === 'all' ? -999999 : parseInt(fromDate.replace('ac', '')) * (fromDate.includes('ac') ? -1 : 1);
            const toYear = toDate === 'all' ? 999999 : parseInt(toDate.replace('ac', '')) * (toDate.includes('ac') ? -1 : 1);
            const matchesDate = year >= fromYear && year <= toYear;

            if (matchesText && matchesEra && matchesDrink && matchesDate) {
                card.classList.remove('hidden');
                if (normalizedQuery !== '') {
                    card.classList.add('highlight');
                    setTimeout(() => card.classList.remove('highlight'), 500);
                }
                visibleCount++;
            } else {
                card.classList.add('hidden');
            }
        });

        // Update stats
        if (statsElement) {
            if (normalizedQuery === '' && getActiveFilters().eras.length === 4) {
                statsElement.textContent = `Mostrando todos los ${totalCards} eventos`;
            } else {
                statsElement.textContent = `Mostrando ${visibleCount} de ${totalCards} eventos`;
            }
        }

        // Show/hide clear button
        if (clearButton) {
            clearButton.style.display = normalizedQuery !== '' ? 'flex' : 'none';
        }

        // Apply sorting
        sortCards();
    }

    // Sort cards
    function sortCards() {
        const visibleCards = Array.from(document.querySelectorAll('.history-card:not(.hidden)'));
        const grids = document.querySelectorAll('.era-grid');
        
        visibleCards.sort((a, b) => {
            const yearA = parseYear(a);
            const yearB = parseYear(b);
            const titleA = a.querySelector('.card-title')?.textContent || '';
            const titleB = b.querySelector('.card-title')?.textContent || '';
            
            switch(currentSort) {
                case 'date-asc':
                    return yearA - yearB;
                case 'date-desc':
                    return yearB - yearA;
                case 'name':
                    return titleA.localeCompare(titleB);
                case 'relevance':
                    // Keep original order (by relevance/historical importance)
                    return 0;
                default:
                    return yearA - yearB;
            }
        });
    }

    // Event listeners
    searchInput.addEventListener('input', (e) => {
        performSearch(e.target.value);
    });

    if (clearButton) {
        clearButton.addEventListener('click', () => {
            searchInput.value = '';
            performSearch('');
            searchInput.focus();
        });
    }

    if (applyFiltersBtn) {
        applyFiltersBtn.addEventListener('click', () => {
            performSearch(searchInput.value);
            if (filtersPanel) filtersPanel.style.display = 'none';
            if (toggleFiltersBtn) toggleFiltersBtn.classList.remove('active');
        });
    }

    if (resetFiltersBtn) {
        resetFiltersBtn.addEventListener('click', () => {
            // Reset all checkboxes
            document.querySelectorAll('.filter-chip input').forEach(cb => cb.checked = true);
            // Reset date selects
            if (dateFrom) dateFrom.value = 'all';
            if (dateTo) dateTo.value = '2024';
            // Reset search
            searchInput.value = '';
            performSearch('');
        });
    }

    if (sortSelect) {
        sortSelect.addEventListener('change', (e) => {
            currentSort = e.target.value;
            performSearch(searchInput.value);
        });
    }

    // Keyboard shortcuts
    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            searchInput.value = '';
            performSearch('');
        }
    });

    // Initial sort
    sortCards();
}

// Course Manager
class CourseManager {
    constructor(app) {
        this.app = app;
        this.courses = {
            fundamentos: {
                title: 'Fundamentos de Mixología',
                modules: 6,
                totalDuration: 480,
                description: 'Curso introductorio perfecto para principiantes'
            },
            avanzadas: {
                title: 'Técnicas Avanzadas',
                modules: 7,
                totalDuration: 720,
                description: 'Curso avanzado para bartenders experimentados'
            },
            cristaleria: {
                title: 'Cristalería y Presentación',
                modules: 6,
                totalDuration: 360,
                description: 'Curso especializado en presentación y servicio'
            }
        };
        this.initializeCourses();
    }

    initializeCourses() {
        // Initialize course progress if not exists
        if (!this.app.courseProgress) {
            this.app.courseProgress = {};
        }
        
        // Bind course events
        this.bindCourseEvents();
    }

    saveCourseProgress() {
        localStorage.setItem(this.app.coursesKey, JSON.stringify(this.app.courseProgress));
    }

    startCourse(courseId) {
        if (!this.app.courseProgress[courseId]) {
            this.app.courseProgress[courseId] = {
                started: true,
                completed: false,
                currentModule: 1,
                completedModules: [],
                startDate: new Date().toISOString(),
                progress: 0
            };
        }
        
        this.saveCourseProgress();
        this.showCourseStart(courseId);
    }

    showCourseStart(courseId) {
        const course = this.courses[courseId];
        const progress = this.app.courseProgress[courseId];
        
        const modal = document.createElement('div');
        modal.className = 'course-modal';
        modal.innerHTML = `
            <div class="course-modal-content">
                <div class="course-modal-header">
                    <h3>${course.title}</h3>
                    <button class="modal-close" onclick="this.closest('.course-modal').remove()">×</button>
                </div>
                <div class="course-modal-body">
                    <p>${course.description}</p>
                    <div class="course-stats">
                        <span><i class="fa-solid fa-book"></i> ${course.modules} módulos</span>
                        <span><i class="fa-solid fa-clock"></i> ${Math.floor(course.totalDuration / 60)} horas</span>
                    </div>
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: ${progress.progress}%"></div>
                    </div>
                    <p class="progress-text">Progreso: ${progress.progress}% completado</p>
                </div>
                <div class="course-modal-footer">
                    <button class="btn-primary" onclick="courseManager.continueCourse('${courseId}')">
                        ${progress.started ? 'Continuar Curso' : 'Comenzar Curso'}
                    </button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });
    }

    continueCourse(courseId) {
        const progress = this.app.courseProgress[courseId];
        this.showModuleContent(courseId, progress.currentModule || 1);
        document.querySelector('.course-modal')?.remove();
    }

    showModuleContent(courseId, moduleNumber) {
        const course = this.courses[courseId];
        const moduleContent = this.getModuleContent(courseId, moduleNumber);
        
        const viewer = document.createElement('div');
        viewer.className = 'module-viewer';
        viewer.innerHTML = `
            <div class="module-viewer-content">
                <div class="module-viewer-header">
                    <button class="back-btn" onclick="courseManager.closeModuleViewer()">← Volver</button>
                    <h3>${course.title} - Módulo ${moduleNumber}</h3>
                    <div class="progress-indicator-header">
                        <div class="progress-bar-small">
                            <div class="progress-fill-small" style="width: ${this.getModuleProgress(courseId, moduleNumber)}%"></div>
                        </div>
                        <span class="progress-text-small">${this.getModuleProgress(courseId, moduleNumber)}% completado</span>
                    </div>
                </div>
                <div class="module-viewer-body">
                    <div class="module-sidebar">
                        <div class="section-nav">
                            <h4 class="section-nav-title">📚 Secciones del Módulo</h4>
                            <div class="section-nav-list">
                                ${moduleContent.sections.map((section, index) => `
                                    <a href="#section-${index}" class="section-nav-item ${index === 0 ? 'active' : ''}" onclick="courseManager.scrollToSection(${index})">
                                        <span class="section-nav-icon">${section.icon}</span>
                                        <span class="section-nav-text">${section.title}</span>
                                        <span class="section-nav-number">${index + 1}</span>
                                    </a>
                                `).join('')}
                            </div>
                        </div>
                        
                        <div class="module-progress-bar">
                            <h4 class="section-nav-title">📊 Progreso del Módulo</h4>
                            <div class="progress-sections">
                                ${moduleContent.sections.map((section, index) => `
                                    <div class="progress-section ${this.isSectionCompleted(courseId, moduleNumber, index) ? 'completed' : ''}" data-section="${index}">
                                        <div class="section-number">${index + 1}</div>
                                        <div class="section-status">${this.isSectionCompleted(courseId, moduleNumber, index) ? '✅' : '⭕'}</div>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    </div>
                    
                    <div class="module-content">
                        <div class="module-lesson">
                            ${moduleContent.sections.map((section, index) => `
                                <div class="lesson-section ${this.isSectionCompleted(courseId, moduleNumber, index) ? 'completed' : ''}" id="section-${index}" data-section="${index}">
                                    <div class="lesson-section-header">
                                        <span class="lesson-section-icon">${section.icon}</span>
                                        <h4 class="lesson-section-title">${section.title}</h4>
                                    </div>
                                    <div class="lesson-section-content">
                                        ${section.content}
                                    </div>
                                    <div class="lesson-exercises">
                                        ${section.exercises}
                                    </div>
                                    <button class="btn-complete-section" onclick="courseManager.completeSection('${courseId}', '${moduleNumber}', ${index})" ${this.isSectionCompleted(courseId, moduleNumber, index) ? 'disabled' : ''}>
                                        ${this.isSectionCompleted(courseId, moduleNumber, index) ? '✅ Completado' : 'Marcar como Completado'}
                                    </button>
                                </div>
                            `).join('')}
                            
                            <div class="module-navigation">
                                <button class="btn-secondary" onclick="courseManager.closeModuleViewer()">Cerrar</button>
                                <button class="btn-primary" onclick="courseManager.nextModule('${courseId}', '${moduleNumber}')" ${this.getCompletedSections(courseId, moduleNumber) === moduleContent.sections.length ? '' : 'disabled'}>
                                    Siguiente Módulo →
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(viewer);
        
        viewer.addEventListener('click', (e) => {
            if (e.target === viewer) {
                this.closeModuleViewer();
            }
        });
        
        // Initialize scroll spy for section navigation
        this.initializeScrollSpy();
    }
    
    scrollToSection(sectionIndex) {
        const section = document.getElementById(`section-${sectionIndex}`);
        if (section) {
            section.scrollIntoView({ behavior: 'smooth', block: 'start' });
            this.updateActiveSection(sectionIndex);
        }
    }
    
    updateActiveSection(activeIndex) {
        // Update navigation items
        const navItems = document.querySelectorAll('.section-nav-item');
        navItems.forEach((item, index) => {
            if (index === activeIndex) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });
    }
    
    initializeScrollSpy() {
        const sections = document.querySelectorAll('.lesson-section');
        const navItems = document.querySelectorAll('.section-nav-item');
        
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const index = parseInt(entry.target.dataset.section);
                    this.updateActiveSection(index);
                }
            });
        }, {
            threshold: 0.5,
            rootMargin: '-100px 0px -100px 0px'
        });
        
        sections.forEach(section => {
            observer.observe(section);
        });
    }

    getModuleContent(courseId, moduleNumber) {
        const courseContent = {
            fundamentos: {
                '1.1': {
                    title: 'Historia y Cultura',
                    sections: [
                        {
                            icon: '📜',
                            title: 'Sección 1: Orígenes y Fundamentos Históricos (1806-1850)',
                            content: `
                                <h4>🏛️ El Nacimiento del Cóctel - La Definición Fundamental</h4>
                                <p>La mixología moderna nace formalmente en Estados Unidos. El 6 de mayo de 1806, "The Balance and Columbian Repository" de Hudson, Nueva York, publica la primera definición escrita de cóctel: "bebida estimulante compuesta de cualquier tipo de azúcar, agua y bitters". Esta definición fundamental sentó las bases de lo que hoy conocemos como mixología científica.</p>
                                
                                <h4>📚 Contexto Pre-Cóctel - Bebidas Antiguas</h4>
                                <p>Antes de 1806, existían bebidas mezcladas pero no se llamaban cócteles:</p>
                                <ul>
                                    <li><strong>Punch (siglo XVII):</strong> Originado en India, popularizado en Inglaterra</li>
                                    <li><strong>Grog (1740s):</strong> Agua, ron, limón, azúcar - bebida naval británica</li>
                                    <li><strong>Sling (siglo XVIII):</strong> Espíritus, agua, azúcar, bitters</li>
                                    <li><strong>Toddy (siglo XVIII):</strong> Espíritus calientes, agua, azúcar, especias</li>
                                </ul>
                                
                                <h4>🥃 Jerry Thomas - El Padre de la Mixología Moderna</h4>
                                <p>Jerry Thomas (1830-1885), nativo de Connecticut, es universalmente reconocido como el padre de la mixología moderna. Su carrera en el Occidental Hotel de Nueva York revolucionó el bartending:</p>
                                <ul>
                                    <li><strong>Innovador Espectacular:</strong> Popularizó el "flair bartending" con su famoso Blue Blazer</li>
                                    <li><strong>Pionero Literario:</strong> Publicó "The Bar-Tender's Guide" (1862), primer libro sistemático de cócteles</li>
                                    <li><strong>Maestro Técnico:</strong> Desarrolló técnicas precisas de medición y preparación</li>
                                    <li><strong>Celebridad Internacional:</strong> Trabajó en hoteles de lujo en Europa y América</li>
                                    <li><strong>Blue Blazer Technique:</strong> Cóctel flambeado servido entre dos copas de plata</li>
                                </ul>
                                
                                <h4>📖 Los Primeros Clásicos - Análisis Detallado</h4>
                                <p>Los cócteles clásicos emergieron de necesidades sociales y disponibilidad de ingredientes:</p>
                                
                                <h5>🌿 Sazerac (1838) - El Cóctel más Antiguo de América</h5>
                                <ul>
                                    <li><strong>Origen:</strong> Farmacia de Antoine Peychaud, Nueva Orleans</li>
                                    <li><strong>Ingredientes Originales:</strong> Cognac, bitters Peychaud, azúcar, absenta</li>
                                    <li><strong>Evolución:</strong> Durante la Prohibición se sustituyó cognac por rye whiskey</li>
                                    <li><strong>Técnica:</strong> Rinsing de vaso con absenta, construcción en vaso</li>
                                    <li><strong>Significado:</strong> "Sazerac" era la marca de cognac que Peychaud usaba</li>
                                </ul>
                                
                                <h5>🥃 Old Fashioned (1880s) - La Definición del Whiskey Cocktail</h5>
                                <ul>
                                    <li><strong>Concepto:</strong> "Whiskey cocktail servido de la manera antigua"</li>
                                    <li><strong>Controversia:</strong> Debate sobre inclusion de frutas o solo whiskey, azúcar, bitters</li>
                                    <li><strong>Técnica:</strong> Muddle de azúcar con bitters, adición de whiskey, hielo</li>
                                    <li><strong>Variantes:</strong> Brandy Old Fashioned, Rum Old Fashioned</li>
                                    <li><strong>Cultural Impact:</strong> Definió el estándar de whiskey cocktails</li>
                                </ul>
                                
                                <h5>🏙️ Manhattan (1870s) - Elegancia Neoyorquina</h5>
                                <ul>
                                    <li><strong>Leyenda:</strong> Creado en el Manhattan Club para banquetes de Lady Randolph Churchill</li>
                                    <li><strong>Balance Perfecto:</strong> 2:1 whiskey:vermouth con dash de bitters</li>
                                    <li><strong>Evolución:</strong> Originalmente con rye whiskey, luego bourbon aceptado</li>
                                    <li><strong>Variaciones:</strong> Dry Manhattan (vermouth dry), Perfect Manhattan (mitad seco/mitad dulce)</li>
                                    <li><strong>Symbolism:</strong> Representa sofisticación urbana neoyorquina</li>
                                </ul>
                                
                                <h5>🍸 Martini (1860s) - El Rey de los Cócteles</h5>
                                <ul>
                                    <li><strong>Orígenes Disputados:</strong> Multiple claimants including Jerry Thomas</li>
                                    <li><strong>Evolución:</strong> De "Martinez" (sweet) a "Dry Martini" (dry)</li>
                                    <li><strong>Controversia Eterna:</strong> Gin vs vodka, stirred vs shaken, olives vs twist</li>
                                    <li><strong>Cultural Impact:</strong> Símbolo de sofisticación y elegancia</li>
                                    <li><strong>Global Icon:</strong> Reconocido mundialmente como el cóctel por excelencia</li>
                                </ul>
                                
                                <h4>🌍 La Influencia Europea - Intercambio Transatlántico</h4>
                                <p>Europa contribuyó fundamentalmente al desarrollo de la mixología americana:</p>
                                
                                <h5>🇮🇹 Contribuciones Italianas:</h5>
                                <ul>
                                    <li><strong>Vermouth de Turín:</strong> António Benedetto Carpano crea el primer vermouth (1786)</li>
                                    <li><strong>Amaro y Liqueurs:</strong> Campari (1860), Aperol (1919), Amaretto</li>
                                    <li><strong>Técnicas de Infusión:</strong> Métodos europeos de maceración de hierbas</li>
                                    <li><strong>Cultura del Aperitivo:</strong> Tradición italiana de bebidas antes de comer</li>
                                </ul>
                                
                                <h5>🇫🇷 Contribuciones Francesas:</h5>
                                <ul>
                                    <li><strong>Cognac y Armagnac:</strong> Brandy francés como base espiritual</li>
                                    <li><strong>Champagne:</strong> Inspiración para cócteles espumosos</li>
                                    <li><strong>Técnicas de Service:</strong> El arte del servicio en cafés y bares parisinos</li>
                                    <li><strong>Savoir Faire:</strong> Elegancia y sofisticación francesa en el servicio</li>
                                </ul>
                                
                                <h5>🇬🇧 Contribuciones Británicas:</h5>
                                <ul>
                                    <li><strong>Gin London Dry:</strong> Perfeccionamiento del gin seco</li>
                                    <li><strong>Punch Culture:</strong> Tradición británica de punches grandes</li>
                                    <li><strong>Club Culture:</strong> Bares exclusivos de gentlemen's clubs</li>
                                    <li><strong>Imperial Influence:</strong> Ingredientes de las colonias británicas</li>
                                </ul>
                                
                                <h4>⚙️ Contexto Social y Tecnológico</h4>
                                <p>El desarrollo de los cócteles refleja cambios sociales y tecnológicos:</p>
                                
                                <h5>🏭 Revolución Industrial:</h5>
                                <ul>
                                    <li><strong>Producción de Hielo:</strong> Frederic Tudor (1806-1864) "Ice King"</li>
                                    <li><strong>Transporte:</strong> Ferrocarriles facilitan distribución de ingredientes</li>
                                    <li><strong>Manufactura:</strong> Producción masiva de botellas y herramientas</li>
                                    <li><strong>Standardization:</strong> Medidas estandarizadas y质量控制</li>
                                </ul>
                                
                                <h5>👥 Cambios Sociales:</h5>
                                <ul>
                                    <li><strong>Urbanización:</strong> Crecimiento de ciudades y vida social</li>
                                    <li><strong>Clase Media Emergente:</strong> Mayor poder adquisitivo para ocio</li>
                                    <li><strong>Women's Suffrage:</strong> Las mujeres entran a los bares</li>
                                    <li><strong>Immigration:</strong> Influencias culturales diversas</li>
                                    <li><strong>Business Culture:</strong> Networking y negocios en bares</li>
                                </ul>
                                
                                <h4>🏛️ Instituciones Pioneras</h4>
                                <p>Establecimientos que definieron los estándares de excelencia:</p>
                                
                                <h5>🏨 American Bar at Savoy Hotel (Londres, 1893):</h5>
                                <ul>
                                    <li><strong>Ada Coleman:</strong> Primera mujer head bartender de renombre</li>
                                    <li><strong>Hanky Panky:</strong> Su creación signature</li>
                                    <li><strong>Estandares:</strong> Servicio impecable y técnicas precisas</li>
                                    <li><strong>Legacy:</strong> Definió el estándar europeo de bartending</li>
                                </ul>
                                
                                <h5>🏰 Waldorf-Astoria (Nueva York, 1890s):</h5>
                                <ul>
                                    <li><strong>Luxury Standards:</strong> Definición de lujo en servicio</li>
                                    <li><strong>Cocktail Menus:</strong> Menús extensos y organizados</li>
                                    <li><strong>Staff Training:</strong> Programas formales de entrenamiento</li>
                                    <li><strong>Innovation:</strong> Nuevas creaciones y técnicas</li>
                                </ul>
                            `,
                            exercises: `
                                <h4>🎯 Ejercicios Prácticos - Sección 1</h4>
                                <ol>
                                    <li><strong>Investigación Histórica:</strong> Investiga y recrea un cóctel histórico pre-1900 con técnicas auténticas</li>
                                    <li><strong>Análisis Tecnológico:</strong> Explica cómo la refrigeración artificial cambió la mixología</li>
                                    <li><strong>Comparación de Técnicas:</strong> Compara métodos de Jerry Thomas vs bartenders modernos</li>
                                    <li><strong>Timeline Visual:</strong> Crea una línea de tiempo detallada de los primeros cócteles clásicos</li>
                                    <li><strong>Role Playing:</strong> Simula ser bartender en 1880 con ingredientes disponibles</li>
                                    <li><strong>Recipe Evolution:</strong> Traza la evolución de un cóctel clásico a través del tiempo</li>
                                    <li><strong>Cultural Analysis:</strong> Analiza cómo los factores sociales influyeron en el desarrollo</li>
                                </ol>
                                
                                <h4>📝 Proyecto Práctico</h4>
                                <p><strong>Proyecto: "Cóctel Histórico Auténtico"</strong></p>
                                <ul>
                                    <li>Selecciona un cóctel clásico pre-1900</li>
                                    <li>Investiga ingredientes y técnicas originales</li>
                                    <li>Recrea el cóctel usando métodos históricos</li>
                                    <li>Documenta diferencias con versión moderna</li>
                                    <li>Presenta análisis de evolución histórica</li>
                                </ul>
                            `
                        },
                        {
                            icon: '🌍',
                            title: 'Sección 2: Evolución Global y Cultura del Cóctel (1850-Presente)',
                            content: `
                                <h4>🌟 La Era de Oro (1850-1920) - El Apogeo Clásico</h4>
                                <p>Este período representa la edad dorada de los cócteles clásicos. Nueva York se consolidó como la capital mundial de la mixología, con bartenders que sistematizaron y elevaron el arte del cóctel a niveles sin precedentes.</p>
                                
                                <h5>📚 Harry Johnson - El Systematizador</h5>
                                <p>Harry Johnson, contemporáneo de Jerry Thomas, contribuyó significativamente:</p>
                                <ul>
                                    <li><strong>"Harry Johnson's Bartender's Manual" (1882):</strong> Guía más sistemática que la de Thomas</li>
                                    <li><strong>European Experience:</strong> Trabajó en Londres y París, importando técnicas</li>
                                    <li><strong>Standardization:</strong> Estableció medidas y procedimientos estándar</li>
                                    <li><strong>Innovations:</strong> Contribuyó con cócteles como the Johnson</li>
                                    <li><strong>Professionalism:</strong> Elevó el bartending a profesión respetada</li>
                                </ul>
                                
                                <h5>📝 William Schmidt - El Poeta del Cóctel</h5>
                                <ul>
                                    <li><strong>"The Flowing Bowl" (1892):</strong> Enfoque poético y filosófico</li>
                                    <li><strong>Philosophy:</strong> El cóctel como arte y experiencia sensorial</li>
                                    <li><strong>Techniques:</strong> Énfasis en balance y armonía</li>
                                    <li><strong>Innovation:</strong> Cócteles con nombres poéticos y significados</li>
                                </ul>
                                
                                <h4>🚫 La Prohibición (1920-1933) - Crisis y Transformación</h4>
                                <p>La Ley Seca (18th Amendment) representó el mayor desafío y transformación en la historia de la mixología americana.</p>
                                
                                <h5>📊 Impacto Directo en Estados Unidos:</h5>
                                <ul>
                                    <li><strong>Cierre de Bares:</strong> 177,000 bares cerraron entre 1920-1933</li>
                                    <li><strong>Speakeasies:</strong> Más de 200,000 bares clandestinos operaron</li>
                                    <li><strong>Quality Decline:</strong> Cócteles simples para ocultar alcohol de mala calidad</li>
                                    <li><strong>Bootleg Liquor:</strong> Alcohol industrial y contrabando dominaron el mercado</li>
                                    <li><strong>Criminalization:</strong> Industria ilegal, violencia, corrupción</li>
                                </ul>
                                
                                <h5>✈️ Diáspora de Bartenders:</h5>
                                <p>Los mejores bartenders americanos emigraron, llevando su arte globalmente:</p>
                                
                                <h6>🇮🇹 Harry's Bar (Venecia, 1931):</h6>
                                <ul>
                                    <li><strong>Giuseppe Cipriani:</strong> Fundador, aprendió de bartenders americanos</li>
                                    <li><strong>Bellini (1948):</strong> Inventado por Cipriani, inspirado en pintor veneciano</li>
                                    <li><strong>Standards:</strong> Mantuvo estándares americanos de calidad</li>
                                    <li><strong>Clientele:</strong> Artistas, escritores, celebridades internacionales</li>
                                </ul>
                                
                                <h6>🇫🇷 Ritz Hotel (París):</h6>
                                <ul>
                                    <li><strong>Frank Meier:</strong> Bartender austríaco-estadounidense</li>
                                    <li><strong>Innovations:</strong> Cócteles como the Mimosa</li>
                                    <li><strong>Luxury Service:</strong> Servicio de lujo europeo con técnicas americanas</li>
                                    <li><strong>Cultural Exchange:</strong> Fusión de estilos europeos y americanos</li>
                                </ul>
                                
                                <h6>🇨🇺 Havana, Cuba:</h6>
                                <ul>
                                    <li><strong>El Floridita:</strong> Constantino Ribalaigua, "El Rey de los Daiquiris"</li>
                                    <li><strong>Innovations:</strong> Daiquiris frozen, cócteles tropicales</li>
                                    <li><strong>Cultural Fusion:</strong> Mezcla de técnicas americanas con ingredientes locales</li>
                                    <li><strong>Tropical Revolution:</strong> Popularización de rums y frutas tropicales</li>
                                </ul>
                                
                                <h4>🌎 Estilos Regionales - Desarrollo de Identidades</h4>
                                <p>Cada región desarrolló su estilo único basado en cultura, ingredientes disponibles, y preferencias locales:</p>
                                
                                <h5>🇺🇸 Estilo Americano - Bold y Directo</h5>
                                <ul>
                                    <li><strong>Characteristics:</strong> Cócteles robustos, whiskey-forward, directos</li>
                                    <li><strong>Philosophy:</strong> Calidad del espíritu como protagonista</li>
                                    <li><strong>Examples:</strong> Old Fashioned, Manhattan, Sazerac</li>
                                    <li><strong>Techniques:</strong> Stirring, minimal modification</li>
                                    <li><strong>Ice Philosophy:</strong> Abundante, para dilution control</li>
                                    <li><strong>Cultural Roots:</strong> Frontier spirit, individualismo, boldness</li>
                                </ul>
                                
                                <h5>🇬🇧 Estilo Británico - Elegancia y Precisión</h5>
                                <ul>
                                    <li><strong>Characteristics:</strong> Cócteles elegantes, gin-based, precisión técnica</li>
                                    <li><strong>Philosophy:</strong> Balance perfecto, presentación impecable</li>
                                    <li><strong>Examples:</strong> Martini, Gibson, Bramble</li>
                                    <li><strong>Techniques:</strong> Stirring meticulous, measurements exactas</li>
                                    <li><strong>Influence:</strong> Club culture, afternoon tea traditions</li>
                                    <li><strong>Social Context:</strong> Gentlemen's clubs, high society</li>
                                </ul>
                                
                                <h5>🇫🇷 Estilo Francés - Sofisticación y Aperitivos</h5>
                                <ul>
                                    <li><strong>Characteristics:</strong> Cócteles sofisticados, vermouth-heavy, aperitivos</li>
                                    <li><strong>Philosophy:</strong> Cóctel como experiencia social, aperitivo culture</li>
                                    <li><strong>Examples:</strong> French 75, Vesper, Boulevardier</li>
                                    <li><strong>Techniques:</strong> Layering, champagne cocktails</li>
                                    <li><strong>Influence:</strong> Café society, art deco movement</li>
                                    <li><strong>Lifestyle:</strong> Café culture, social hour, elegance</li>
                                </ul>
                                
                                <h5>🇯🇵 Estilo Japonés - Minimalismo y Perfección</h5>
                                <ul>
                                    <li><strong>Characteristics:</strong> Minimalista, precisión extrema, presentación impecable</li>
                                    <li><strong>Philosophy:</strong> Perfección en cada detalle, wabi-sabi aesthetics</li>
                                    <li><strong>Examples:</strong> Japanese Martini, Highball, Yuzu cocktails</li>
                                    <li><strong>Techniques:</strong> Hard shake, karaoke shake, ice carving</li>
                                    <li><strong>Influence:</strong> Tea ceremony, zen philosophy</li>
                                    <li><strong>Cultural Values:</strong> Precision, respect for ingredients, harmony</li>
                                </ul>
                                
                                <h5>🌎 Estilo Latinoamericano - Tropical y Vibrante</h5>
                                <ul>
                                    <li><strong>Characteristics:</strong> Tropical, rums, frutas frescas, vibrante</li>
                                    <li><strong>Philosophy:</strong> Celebración, fiesta, ingredientes locales</li>
                                    <li><strong>Examples:</strong> Mojito, Caipirinha, Pisco Sour</li>
                                    <li><strong>Techniques:</strong> Muddling, shaking con frutas</li>
                                    <li><strong>Influence:</strong> Carnival culture, tropical ingredients</li>
                                    <li><strong>Social Context:</strong> Beach culture, fiestas, celebration</li>
                                </ul>
                                
                                <h4>🏛️ Bares Legendarios y su Legado Duradero</h4>
                                <p>Establecimientos que no solo sirvieron cócteles excepcionales, sino que definieron estándares y crearon legados duraderos:</p>
                                
                                <h5>🏨 Savoy's American Bar (Londres, 1893-Presente)</h5>
                                <ul>
                                    <li><strong>Ada Coleman (1900-1924):</strong> Primera mujer head bartender famosa</li>
                                    <li><strong>Hanky Panky:</strong> Su creación (gin, vermouth sweet, Fernet-Branca)</li>
                                    <li><strong>Harry Craddock (1925-1940s):</strong> "The Savoy Cocktail Book" (1930)</li>
                                    <li><strong>Legacy:</strong> 750+ recetas, estándares de servicio impecables</li>
                                    <li><strong>Cultural Impact:</strong> Definió el estándar europeo de bartending</li>
                                </ul>
                                
                                <h5>🍸 Harry's Bar (Venecia, 1931-Presente)</h5>
                                <ul>
                                    <li><strong>Giuseppe Cipriani:</strong> Fundador, aprendió de expatriados americanos</li>
                                    <li><strong>Bellini (1948):</strong> Prosecco y puré de durazno blanco</li>
                                    <li><strong>Harry's Bar:</strong> Cóctel signature con jugo de naranja y Campari</li>
                                    <li><strong>Clientele:</strong> Ernest Hemingway, Orson Welles, Humphrey Bogart</li>
                                    <li><strong>Innovation:</strong> Chilled glass service, quality ingredients</li>
                                </ul>
                                
                                <h5>🍹 El Floridita (La Habana, 1930s-Presente)</h5>
                                <ul>
                                    <li><strong>Constantino Ribalaigua:</strong> "El Rey de los Daiquiris"</li>
                                    <li><strong>Daiquiri Variations:</strong> Frozen, fruit-flavored, layered</li>
                                    <li><strong>Technique:</strong> Frappe method para frozen drinks</li>
                                    <li><strong>Hemingway Connection:</strong> Regular patron, inspired Hemingway Daiquiri</li>
                                    <li><strong>Legacy:</strong> Popularización de frozen cocktails</li>
                                </ul>
                                
                                <h5>🏝️ Tiki Bars (1930s-1960s) - Escape Tropical</h5>
                                <ul>
                                    <li><strong>Donn Beach (Don the Beachcomber):</strong> Inventor del tiki culture</li>
                                    <li><strong>Tiki Movement:</strong> 1934, Don the Beachcomber restaurant, Hollywood</li>
                                    <li><strong>Trader Vic:</strong> Victor Bergeron, competidor y colaborador</li>
                                    <li><strong>Mai Tai:</strong> Controversia sobre invención (1940s)</li>
                                    <li><strong>Cultural Impact:</strong> Escape post-Guerra, exotismo, rum cocktails</li>
                                </ul>
                                
                                <h4>🏛️ El Bar como Centro Social - Evolución del Tercer Lugar</h4>
                                <p>Los bares han evolucionado como centros sociales fundamentales en diferentes eras:</p>
                                
                                <h5>🎭 Éra Victoriana (1837-1901):</h5>
                                <ul>
                                    <li><strong>Gender Segregation:</strong> Bares para hombres, lounges para mujeres</li>
                                    <li><strong>Class Structure:</strong> Bares working class vs gentlemen's clubs</li>
                                    <li><strong>Function:</strong> Business networking, political discussion</li>
                                    <li><strong>Architecture:</strong> Ornate bars, marble countertops, back bars</li>
                                </ul>
                                
                                <h5>🚫 Speakeasy Era (1920-1933):</h5>
                                <ul>
                                    <li><strong>Rebellion Culture:</strong> Desafío a la autoridad, clandestinidad</li>
                                    <li><strong>Integration:</strong> Primera vez hombres y mujeres socializan juntos</li>
                                    <li><strong>Innovation:</strong> Cócteles para ocultar mal sabor del alcohol</li>
                                    <li><strong>Entertainment:</strong> Jazz, dancing, gambling</li>
                                </ul>
                                
                                <h5>🏢 Post-War Boom (1945-1960s):</h5>
                                <ul>
                                    <li><strong>Suburban Culture:</strong> Cocktail parties at home</li>
                                    <li><strong>Business Networking:</strong> Three-martini lunch culture</li>
                                    <li><strong>Gender Roles:</strong> Housewife hostess culture</li>
                                    <li><strong>Convenience:</strong> Pre-made mixes, simplified recipes</li>
                                </ul>
                                
                                <h5>🎨 Cocktail Renaissance (1990s-Presente):</h5>
                                <ul>
                                    <li><strong>Craft Movement:</strong> Return to classic techniques</li>
                                    <li><strong>Community Building:</strong> Local bars as community centers</li>
                                    <li><strong>Cultural Diversity:</strong> Global influences, fusion cocktails</li>
                                    <li><strong>Social Media:</strong> Instagram culture, visual presentation</li>
                                </ul>
                                
                                <h4>🔄 Renacimiento Moderno (2000-Presente) - La Era Craft</h4>
                                <p>El renacimiento de la cultura del cóctel representa una revolución en calidad, técnica, y apreciación cultural:</p>
                                
                                <h5>👑 Dale DeGroff - "King Cocktail"</h5>
                                <ul>
                                    <li><strong>Rainbow Room (1987-1999):</strong> Revitalización de cócteles clásicos</li>
                                    <li><strong>"The Craft of the Cocktail" (2002):</strong> Libro fundamental</li>
                                    <li><strong>Philosophy:</strong> Fresh ingredients, proper techniques</li>
                                    <li><strong>Impact:</strong> Inspiró generación de craft bartenders</li>
                                    <li><strong>Legacy:</strong> Padre del movimiento craft cocktail moderno</li>
                                </ul>
                                
                                <h5>🔬 Pioneros del Movimiento Craft:</h5>
                                
                                <h6>🧪 Tony Conigliaro (London):</h6>
                                <ul>
                                    <li><strong>69 Colebrook Row:</strong> Laboratory bar approach</li>
                                    <li><strong>Innovations:</strong> Distillation, clarification, fat washing</li>
                                    <li><strong>Philosophy:</strong> Cóctel como ciencia y arte</li>
                                    <li><strong>Techniques:</strong> Molecular gastronomy aplicada a cócteles</li>
                                </ul>
                                
                                <h6>🥃 Sasha Petraske (New York):</h6>
                                <ul>
                                    <li><strong>Milk & Honey (2000):</strong> Speakeasy revival</li>
                                    <li><strong>Standards:</strong> Ice program, fresh juices, classic focus</li>
                                    <li><strong>Legacy:</strong> Influenció a toda la escena neoyorquina</li>
                                    <li><strong>Innovation:</strong> Hidden bar concept, speakeasy culture</li>
                                </ul>
                                
                                <h6>📚 Jim Meehan (New York):</h6>
                                <ul>
                                    <li><strong>PDT (Please Don't Tell):</strong> Hidden bar concept</li>
                                    <li><strong>"The PDT Cocktail Book" (2011):</strong> Referencia moderna</li>
                                    <li><strong>Innovation:</strong> Hot dog pairing, bar-through-telephone booth</li>
                                    <li><strong>Philosophy:</strong> Creative yet classic approach</li>
                                </ul>
                                
                                <h5>🌐 Globalización y Acceso:</h5>
                                <ul>
                                    <li><strong>Ingredient Access:</strong> Importación global de licores raros</li>
                                    <li><strong>Technique Sharing:</strong> Internet, competitions, workshops</li>
                                    <li><strong>Cultural Exchange:</strong> Bartenders traveling, international bars</li>
                                    <li><strong>Education:</strong> Formal bartending schools, certifications</li>
                                </ul>
                                
                                <h5>💻 Tecnología Moderna:</h5>
                                <ul>
                                    <li><strong>Social Media:</strong> Instagram, YouTube, TikTok influence</li>
                                    <li><strong>Equipment:</strong> Modern shakers, precise scales, temperature control</li>
                                    <li><strong>Ingredients:</strong> Molecular gastronomy, house-made ingredients</li>
                                    <li><strong>Service:</strong> POS systems, inventory management, customer data</li>
                                </ul>
                            `,
                            exercises: `
                                <h4>🎯 Ejercicios Prácticos - Sección 2</h4>
                                <ol>
                                    <li><strong>Análisis de Impacto:</strong> Analiza detalladamente cómo la Prohibición afectó la evolución de los cócteles</li>
                                    <li><strong>Comparación Regional:</strong> Compara estilos regionales actuales vs sus raíces históricas</li>
                                    <li><strong>Investigación Local:</strong> Investiga la historia completa de un bar legendario de tu región</li>
                                    <li><strong>Análisis Tecnológico:</strong> Explica cómo la tecnología moderna impacta cada aspecto de la mixología</li>
                                    <li><strong>Style Recreation:</strong> Recrea un cóctel usando las técnicas de un estilo regional específico</li>
                                    <li><strong>Cultural Analysis:</strong> Analiza cómo los bares reflejan cambios sociales actuales</li>
                                    <li><strong>Global Influence:</strong> Investiga cómo la globalización ha cambiado la mixología local</li>
                                </ol>
                                
                                <h4>📝 Proyecto de Investigación</h4>
                                <p><strong>Proyecto: "Análisis de Evolución de un Cóctel Clásico"</strong></p>
                                <ul>
                                    <li>Selecciona un cóctel clásico (ej. Martini, Old Fashioned)</li>
                                    <li>Investiga su origen y evolución histórica detallada</li>
                                    <li>Analiza cómo diferentes eras lo modificaron</li>
                                    <li>Entrevista a bartenders sobre su interpretación moderna</li>
                                    <li>Crea una presentación completa de su evolución cultural</li>
                                </ul>
                                
                                <h4>🌍 Taller de Estilos Regionales</h4>
                                <p><strong>Taller: "Masterclass de Estilos Regionales"</strong></p>
                                <ul>
                                    <li>Prepara el mismo cóctel base usando 3 estilos regionales diferentes</li>
                                    <li>Documenta diferencias en técnica, presentación, sabor</li>
                                    <li>Explica filosofía detrás de cada estilo</li>
                                    <li>Crea variación personal fusionando elementos de diferentes estilos</li>
                                </ul>
                            `
                        }
                    ]
                },
                '1.2': {
                    title: 'Herramientas y Equipamiento',
                    sections: [
                        {
                            icon: '🔧',
                            title: 'Herramientas Esenciales',
                            content: `
                                <h4>Shaker (Boston vs Cobbler)</h4>
                                <p><strong>Boston Shaker:</strong> Dos piezas (vaso y tapa), preferido por profesionales. Permite más control y es más versátil.</p>
                                <p><strong>Cobbler Shaker:</strong> Tres piezas con incorporado strainer. Ideal para principiantes y cócteles con muchas frutas.</p>
                                
                                <h4>Jigger (Medidor)</h4>
                                <p>Herramienta fundamental para precisión. Los jiggers estándar tienen 1.5 oz (45ml) de un lado y 1 oz (30ml) del otro. La precisión es clave para el balance perfecto.</p>
                                
                                <h4>Strainers (Coladores)</h4>
                                <ul>
                                    <li><strong>Julep Strainer:</strong> Forma de cuchara, ideal para shaker Boston</li>
                                    <li><strong>Hawthorne Strainer:</strong> Con resorte, perfecto para hielo y frutas</li>
                                    <li><strong>Fine Mesh Strainer:</strong> Doble filtrado para cócteles más suaves</li>
                                </ul>
                                
                                <h4>Bar Spoon</h4>
                                <p>Cuchara larga (aprox 30cm) con peso en el extremo. Diseñada para revolver cócteles en mixing glass y medir pequeñas cantidades.</p>
                            `,
                            exercises: `
                                <ol>
                                    <li>Practica el uso de diferentes tipos de shakers</li>
                                    <li>Mide líquidos usando jigger hasta lograr precisión</li>
                                    <li>Experimenta con diferentes strainers para filtrado</li>
                                </ol>
                            `
                        },
                        {
                            icon: '⚗️',
                            title: 'Equipamiento Avanzado',
                            content: `
                                <h4>Mixing Glass</h4>
                                <p>Vaso de vidrio grueso para revolver cócteles que deben mantenerse claros y fríos sin aireación excesiva.</p>
                                
                                <h4>Muddler</h4>
                                <p>Herramienta para machacar frutas, hierbas y azúcar. Debe usarse con suavidad para no amargar las hierbas.</p>
                                
                                <h4>Citrus Tools</h4>
                                <ul>
                                    <li><strong>Citrus Juicer:</strong> Exprimidor manual para jugo fresco</li>
                                    <li><strong>Peeler:</strong> Para crear twists de cáscara</li>
                                    <li><strong>Zester:</strong> Para ralladura fina de cítricos</li>
                                </ul>
                                
                                <h4>Ice Tools</h4>
                                <p><strong>Ice Scoop:</strong> Cuchara grande para hielo. <strong>Ice Pick:</strong> Para romper bloques de hielo. <strong>Ice Tongs:</strong> Pinzas para manejar hielo con higiene.</p>
                                
                                <h4>Additional Tools</h4>
                                <ul>
                                    <li><strong>Speed Pourer:</strong> Vertedor para botellas</li>
                                    <li><strong>Blender:</strong> Para frozen drinks</li>
                                    <li><strong>Channel Knife:</strong> Para decoraciones de cáscara</li>
                                </ul>
                            `,
                            exercises: `
                                <ol>
                                    <li>Prepara un cóctel usando mixing glass</li>
                                    <li>Practica técnicas de muddling con diferentes hierbas</li>
                                    <li>Experimenta con diferentes tipos de hielo</li>
                                </ol>
                            `
                        }
                    ]
                },
                '1.3': {
                    title: 'Ingredientes Básicos',
                    sections: [
                        {
                            icon: '🍶',
                            title: 'Licores Base',
                            content: `
                                <h4>¿Qué son los Licores Base?</h4>
                                <p>Son los licores que forman la base de la mayoría de los cócteles. Generalmente constituyen el 50-75% de la bebida y definen el carácter principal del cóctel.</p>
                                
                                <h4>Licores Base Principales:</h4>
                                <ul>
                                    <li><strong>Gin:</strong> Neutral con botánicos. Ideal para Gin & Tonic, Martini, Negroni</li>
                                    <li><strong>Vodka:</strong> Neutral y versátil. Perfecto para Moscow Mule, Cosmopolitan, Bloody Mary</li>
                                    <li><strong>Whisky:</strong> Complejo y robusto. Clásico para Old Fashioned, Manhattan, Whiskey Sour</li>
                                    <li><strong>Ron:</strong> Dulce y tropical. Esencial para Mojito, Daiquiri, Piña Colada</li>
                                    <li><strong>Tequila:</strong> Terroso y agave. Base para Margarita, Paloma, Tequila Sunrise</li>
                                    <li><strong>Brandy:</strong> Frutal y suave. Para Sidecar, Brandy Alexander</li>
                                </ul>
                                
                                <h4>Características por Categoria:</h4>
                                <ul>
                                    <li><strong>Neutros:</strong> Vodka, Gin (versátiles)</li>
                                    <li><strong>Destilados de Grano:</strong> Whisky, Gin (complejos)</li>
                                    <li><strong>Destilados de Caña:</strong> Ron, Cachaça (tropicales)</li>
                                    <li><strong>Destilados de Agave:</strong> Tequila, Mezcal (terrosos)</li>
                                </ul>
                            `,
                            exercises: `
                                <ol>
                                    <li>Cata 3 licores base diferentes y anota sus características</li>
                                    <li>Identifica 3 cócteles clásicos para cada licor base</li>
                                    <li>Explica por qué cada licor es ideal para ciertos cócteles</li>
                                </ol>
                            `
                        },
                        {
                            icon: '🍯',
                            title: 'Licores Modificadores',
                            content: `
                                <h4>¿Qué son los Modificadores?</h4>
                                <p>Añaden complejidad, balance y carácter a los cócteles. Generalmente se usan en pequeñas cantidades (15-30ml) para complementar el licor base.</p>
                                
                                <h4>Categorías de Modificadores:</h4>
                                <ul>
                                    <li><strong>Liqueurs:</strong> Chartreuse, Cointreau, Grand Marnier</li>
                                    <li><strong>Aperitivos:</strong> Campari, Aperol, Suze</li>
                                    <li><strong>Amargos:</strong> Fernet-Branca, Amargo Angostura</li>
                                    <li><strong>Fortificados:</strong> Vermouth, Madeira, Port</li>
                                </ul>
                                
                                <h4>Modificadores Esenciales:</h4>
                                <ul>
                                    <li><strong>Triple Sec/Cointreau:</strong> Naranja, para Margarita, Sidecar</li>
                                    <li><strong>Campari:</strong> Amargo rojo, para Negroni, Americano</li>
                                    <li><strong>Vermouth:</strong> Hierbas, para Martini, Manhattan</li>
                                    <li><strong>Chartreuse:</strong> Hierbas complejas, para Last Word</li>
                                    <li><strong>Maraschino:</strong> Cereza, para Aviation, Martinez</li>
                                </ul>
                                
                                <h4>Reglas de Uso:</h4>
                                <ul>
                                    <li>Usar con moderación - pueden dominar fácilmente</li>
                                    <li>Balancear con dulzura o acidez</li>
                                    <li>Considerar el perfil de sabor del licor base</li>
                                </ul>
                            `,
                            exercises: `
                                <ol>
                                    <li>Prueba 5 modificadores diferentes y describe sus sabores</li>
                                    <li>Crea un cóctel usando 2 modificadores</li>
                                    <li>Explica cómo cada modificador cambia el perfil del cóctel</li>
                                </ol>
                            `
                        },
                        {
                            icon: '🍊',
                            title: 'Cítricos y Jugos',
                            content: `
                                <h4>La Importancia de los Cítricos</h4>
                                <p>Los cítricos proporcionan acidez, frescura y balance. Son fundamentales en la mayoría de los cócteles clásicos.</p>
                                
                                <h4>Tipos de Cítricos:</h4>
                                <ul>
                                    <li><strong>Limón:</strong> Acidez brillante, para Whiskey Sour, Tom Collins</li>
                                    <li><strong>Lima:</strong> Acidez tropical, para Mojito, Caipirinha</li>
                                    <li><strong>Naranja:</strong> Dulzura sutil, para Tequila Sunrise, Screwdriver</li>
                                    <li><strong>Pomelo:</strong> Amargo-dulce, para Greyhound, Paloma</li>
                                    <li><strong>Toronja:</strong> Amargo complejo, para Salty Dog</li>
                                </ul>
                                
                                <h4>Técnicas de Extracción:</h4>
                                <ul>
                                    <li><strong>Jugo Fresco:</strong> Siempre preferible, más sabor y nutrientes</li>
                                    <li><strong>Expressión:</strong> Twist de cáscara para aceites esenciales</li>
                                    <li><strong>Muddling:</strong> Machacar frutas para liberar jugos</li>
                                    <li><strong>Zest:</strong> Ralladura fina para aroma</li>
                                </ul>
                                
                                <h4>Proporciones Estándar:</h4>
                                <ul>
                                    <li>Cócteles agrios: 20-30ml de jugo cítrico</li>
                                    <li>Balance: 2 partes licor, 1 parte dulce, 1 parte ácido</li>
                                    <li>Ajustar según preferencia personal</li>
                                </ul>
                            `,
                            exercises: `
                                <ol>
                                    <li>Extrae jugo de 3 cítricos diferentes y compara sabores</li>
                                    <li>Practica técnicas de expression con diferentes cítricos</li>
                                    <li>Crea un cóctel balanceado usando jugo fresco</li>
                                </ol>
                            `
                        },
                        {
                            icon: '🍬',
                            title: 'Endulzantes y Jarabes',
                            content: `
                                <h4>El Rol del Dulzor</h4>
                                <p>El dulzor balancea la acidez y el alcohol. Es crucial para el equilibrio perfecto de un cóctel.</p>
                                
                                <h4>Tipos de Endulzantes:</h4>
                                <ul>
                                    <li><strong>Azúcar Blanco:</strong> Neutral, versátil, disuelve fácilmente</li>
                                    <li><strong>Azúcar Demerara:</strong> Notas de caramelo, para Old Fashioned</li>
                                    <li><strong>Miel:</strong> Complejidad floral, para Hot Toddy, Gold Rush</li>
                                    <li><strong>Agave:</strong> Terroso, para cócteles con tequila</li>
                                    <li><strong>Maple:</strong> Ahumado-dulce, para cócteles de invierno</li>
                                </ul>
                                
                                <h4>Jarabes Caseros Profesionales:</h4>
                                <ul>
                                    <li><strong>Simple Syrup:</strong> 1:1 azúcar:agua, base universal</li>
                                    <li><strong>Rich Syrup:</strong> 2:1 azúcar:agua, más intenso</li>
                                    <li><strong>Honey Syrup:</strong> 2:1 miel:agua, fácil de usar</li>
                                    <li><strong>Agave Nectar:</strong> 2:1 agave:agua, para tequila</li>
                                </ul>
                                
                                <h4>Técnicas de Preparación:</h4>
                                <ul>
                                    <li>Calentar suavemente para disolver completamente</li>
                                    <li>Enfriar antes de usar</li>
                                    <li>Almacenar en refrigerador hasta 2 semanas</li>
                                    <li>Etiquetar con fecha de preparación</li>
                                </ul>
                            `,
                            exercises: `
                                <ol>
                                    <li>Prepara 3 tipos de jarabes caseros</li>
                                    <li>Compara sabores de diferentes azúcares</li>
                                    <li>Crea un cóctel usando cada tipo de endulzante</li>
                                </ol>
                            `
                        }
                    ]
                },
                '1.4': {
                    title: 'Técnicas Fundamentales',
                    sections: [
                        {
                            icon: '🥤',
                            title: 'Shake (Agitar)',
                            content: `
                                <h4>¿Cuándo Agitar?</h4>
                                <p>Se usa para cócteles con jugos, licores, claras de huevo o ingredientes que necesitan aireación.</p>
                                
                                <h4>Técnica Correcta:</h4>
                                <ol>
                                    <li>Llenar shaker 2/3 con hielo</li>
                                    <li>Agregar ingredientes en orden: licores, jugos, finalmente hielo</li>
                                    <li>Sellar firmemente el shaker</li>
                                    <li>Agitar vigorosamente 12-15 segundos</li>
                                    <li>Formar escarcha en el exterior</li>
                                    <li>Servir inmediatamente</li>
                                </ol>
                                
                                <h4>Cócteles Clásicos que requieren Shake:</h4>
                                <ul>
                                    <li>Margarita</li>
                                    <li>Daiquiri</li>
                                    <li>Whiskey Sour</li>
                                    <li>Pisco Sour</li>
                                    <li>Cosmopolitan</li>
                                    <li>Espresso Martini</li>
                                </ul>
                                
                                <h4>Errores Comunes:</h4>
                                <ul>
                                    <li>No llenar suficiente hielo</li>
                                    <li>Agitar demasiado tiempo (diluye excesivamente)</li>
                                    <li>Agitar muy poco (no enfría suficiente)</li>
                                    <li>No sellar correctamente (derrames)</li>
                                </ul>
                            `,
                            exercises: `
                                <ol>
                                    <li>Practica shaking con diferentes shakers</li>
                                    <li>Prepara 3 cócteles usando técnica shake</li>
                                    <li>Experimenta con tiempos de shaking</li>
                                </ol>
                            `
                        },
                        {
                            icon: '🥄',
                            title: 'Stir (Revolver)',
                            content: `
                                <h4>¿Cuándo Revolver?</h4>
                                <p>Para cócteles con solo licores destilados que deben mantenerse claros y suaves, sin aireación.</p>
                                
                                <h4>Técnica Correcta:</h4>
                                <ol>
                                    <li>Enfriar mixing glass con hielo</li>
                                    <li>Agregar licores</li>
                                    <li>Insertar bar spoon hasta el fondo</li>
                                    <li>Revolver suavemente 20-30 segundos</li>
                                    <li>Mantener contacto con el fondo</li>
                                    <li>Colar en vaso previamente enfriado</li>
                                </ol>
                                
                                <h4>Cócteles Clásicos que requieren Stir:</h4>
                                <ul>
                                    <li>Martini</li>
                                    <li>Manhattan</li>
                                    <li>Negroni</li>
                                    <li>Old Fashioned (sin muddling)</li>
                                    <li>Rob Roy</li>
                                    <li>Boulevardier</li>
                                </ul>
                                
                                <h4>Consejos Profesionales:</h4>
                                <ul>
                                    <li>Usar hielo de alta calidad</li>
                                    <li>No revolver demasiado rápido (crea burbujas)</li>
                                    <li>Mantener movimiento constante y suave</li>
                                    <li>Servir con garnish apropiado</li>
                                </ul>
                            `,
                            exercises: `
                                <ol>
                                    <li>Practica stirring con diferentes licores</li>
                                    <li>Prepara 2 cócteles stirred clásicos</li>
                                    <li>Compara resultados de diferentes tiempos de stirring</li>
                                </ol>
                            `
                        },
                        {
                            icon: '🏗️',
                            title: 'Build (Construir)',
                            content: `
                                <h4>¿Qué es Build?</h4>
                                <p>Construir directamente en el vaso de servicio. La técnica más simple y antigua de preparación de cócteles.</p>
                                
                                <h4>Técnica Correcta:</h4>
                                <ol>
                                    <li>Enfriar vaso si es necesario</li>
                                    <li>Agregar hielo primero</li>
                                    <li>Verter ingredientes en orden</li>
                                    <li>Revolver suavemente con bar spoon</li>
                                    <li>Agregar garnish al final</li>
                                </ol>
                                
                                <h4>Cócteles Clásicos Build:</h4>
                                <ul>
                                    <li>Gin & Tonic</li>
                                    <li>Whiskey Highball</li>
                                    <li>Tom Collins</li>
                                    <li>Dark 'n' Stormy</li>
                                    <li>Cuba Libre</li>
                                    <li>Spritz</li>
                                </ul>
                                
                                <h4>Ventajas del Build:</h4>
                                <ul>
                                    <li>Rápido y eficiente</li>
                                    <li>Menos dilución</li>
                                    <li>Visual atractivo</li>
                                    <li>Fácil de replicar</li>
                                </ul>
                            `,
                            exercises: `
                                <ol>
                                    <li>Prepara 3 cócteles build diferentes</li>
                                    <li>Experimenta con diferentes órdenes de ingredientes</li>
                                    <li>Compara dilución vs otras técnicas</li>
                                </ol>
                            `
                        },
                        {
                            icon: '🎨',
                            title: 'Layer (Estratificar)',
                            content: `
                                <h4>¿Qué es Layer?</h4>
                                <p>Crear capas visuales de diferentes densidades. Técnica espectacular para presentación.</p>
                                
                                <h4>Principio Científico:</h4>
                                <p>Los líquidos menos densos flotan sobre los más densos. El azúcar aumenta la densidad, el alcohol la disminuye.</p>
                                
                                <h4>Técnica Correcta:</h4>
                                <ol>
                                    <li>Conocer densidades relativas</li>
                                    <li>Usar bar spoon o cucharón</li>
                                    <li>Verter lentamente por el costado</li>
                                    <li>Mantener ángulo de 45°</li>
                                    <li>No mezclar las capas</li>
                                </ol>
                                
                                <h4>Orden de Densidad Común:</h4>
                                <ul>
                                    <li>Granadina (más denso)</li>
                                    <li>Jarabes y licores dulces</li>
                                    <li>Jugos</li>
                                    <li>Licores base</li>
                                    <li>Licores de alta graduación</li>
                                    <li>Crema (menos denso)</li>
                                </ul>
                                
                                <h4>Cócteles Layer Famosos:</h4>
                                <ul>
                                    <li>B-52</li>
                                    <li>Tequila Sunrise</li>
                                    <li>Pousse-Café</li>
                                    <li>Irish Coffee</li>
                                </ul>
                            `,
                            exercises: `
                                <ol>
                                    <li>Practica layering con 3 líquidos diferentes</li>
                                    <li>Crea un cóctel layer original</li>
                                    <li>Experimenta con diferentes densidades</li>
                                </ol>
                            `
                        },
                        {
                            icon: '🌿',
                            title: 'Muddle (Machacar)',
                            content: `
                                <h4>¿Qué es Muddle?</h4>
                                <p>Extraer aceites esenciales y jugos de frutas, hierbas y azúcar usando un muddler.</p>
                                
                                <h4>Técnica Correcta:</h4>
                                <ol>
                                    <li>Usar muddler adecuado</li>
                                    <li>Presionar suavemente, no triturar</li>
                                    <li>Rotar mientras presiona</li>
                                    <li>No sobre-muddle (amarga hierbas)</li>
                                    <li>Limpiar entre usos</li>
                                </ol>
                                
                                <h4>Ingredientes para Muddling:</h4>
                                <ul>
                                    <li><strong>Hierbas:</strong> Menta, albahaca, romero</li>
                                    <li><strong>Frutas:</strong> Limón, lima, naranja, fresas</li>
                                    <li><strong>Azúcar:</strong> Con frutas para crear syrup</li>
                                    <li><strong>Especias:</strong> Jengibre, cardamomo</li>
                                </ul>
                                
                                <h4>Cócteles con Muddling:</h4>
                                <ul>
                                    <li>Mojito (menta, lima)</li>
                                    <li>Caipirinha (lima, azúcar)</li>
                                    <li>Old Fashioned (azúcar, bitters)</li>
                                    <li>Mint Julep (menta, azúcar)</li>
                                    <li>Bramble (lima, blackberry)</li>
                                </ul>
                                
                                <h4>Consejos Importantes:</h4>
                                <ul>
                                    <li>Mint: presionar suavemente, no romper</li>
                                    <li>Cítricos: presionar para liberar aceites</li>
                                    <li>Frutas blandas: muddle menos</li>
                                    <li>Azúcar: combinar con frutas primero</li>
                                </ul>
                            `,
                            exercises: `
                                <ol>
                                    <li>Practica muddling con menta y lima</li>
                                    <li>Experimenta con diferentes hierbas</li>
                                    <li>Prepara 2 cócteles que requieren muddling</li>
                                </ol>
                            `
                        }
                    ]
                },
                '1.5': {
                    title: 'Medición y Proporciones',
                    sections: [
                        {
                            icon: '⚖️',
                            title: 'Sistemas de Medición',
                            content: `
                                <h4>Importancia de la Precisión</h4>
                                <p>La medición exacta es fundamental para la consistencia y balance perfecto de los cócteles.</p>
                                
                                <h4>Sistemas Principales:</h4>
                                <ul>
                                    <li><strong>Métrico (ml):</strong> Preciso, usado internacionalmente</li>
                                    <li><strong>Imperial (oz):</strong> Tradicional americano</li>
                                    <li><strong>Parts:</strong> Proporcional, flexible</li>
                                    <li><strong>Count:</strong> Free pouring, experiencia</li>
                                </ul>
                                
                                <h4>Conversiones Básicas:</h4>
                                <ul>
                                    <li>1 oz = 30 ml</li>
                                    <li>1.5 oz = 45 ml</li>
                                    <li>2 oz = 60 ml</li>
                                    <li>0.5 oz = 15 ml</li>
                                    <li>0.25 oz = 7.5 ml</li>
                                    <li>1 pony = 1 oz</li>
                                    <li>1 jigger = 1.5 oz</li>
                                </ul>
                                
                                <h4>Herramientas de Medición:</h4>
                                <ul>
                                    <li><strong>Jigger:</strong> Doble medida estándar</li>
                                    <li><strong>Measuring Glass:</strong> Precisión múltiple</li>
                                    <li><strong>Speed Pourer:</strong> Control de flujo</li>
                                    <li><strong>Bar Spoon:</strong> Pequeñas cantidades</li>
                                </ul>
                            `,
                            exercises: `
                                <ol>
                                    <li>Practica conversiones entre sistemas</li>
                                    <li>Mide líquidos usando diferentes herramientas</li>
                                    <li>Compara precisión entre métodos</li>
                                </ol>
                            `
                        },
                        {
                            icon: '📐',
                            title: 'Proporciones Clásicas',
                            content: `
                                <h4>Fórmulas Universales</h4>
                                <p>Ciertas proporciones funcionan consistentemente across diferentes cócteles.</p>
                                
                                <h4>Sour Formula (2:1:1):</h4>
                                <ul>
                                    <li>2 partes licor base</li>
                                    <li>1 parte endulzante</li>
                                    <li>1 parte ácido (cítrico)</li>
                                    <li>Ejemplos: Whiskey Sour, Daiquiri, Margarita</li>
                                </ul>
                                
                                <h4>Daiquiri Variations:</h4>
                                <ul>
                                    <li>2:1:1 (clásico)</li>
                                    <li>3:2:1 (más ácido)</li>
                                    <li>3:1:1 (más dulce)</li>
                                </ul>
                                
                                <h4>Old Fashioned Formula:</h4>
                                <ul>
                                    <li>2 oz whisky</li>
                                    <li>1 azúcar</li>
                                    <li>2-3 dashes bitters</li>
                                    <li>1 splash water</li>
                                </ul>
                                
                                <h4>Highball Formula:</h4>
                                <ul>
                                    <li>1.5-2 oz licor base</li>
                                    <li>3-4 oz mixer</li>
                                    <li>1-2 oz modifier (opcional)</li>
                                </ul>
                                
                                <h4>Martini Formula:</h4>
                                <ul>
                                    <li>2.5 oz gin/vodka</li>
                                    <li>0.5 oz vermouth dry</li>
                                    <li>1-2 dashes orange bitters</li>
                                </ul>
                            `,
                            exercises: `
                                <ol>
                                    <li>Crea variaciones usando sour formula</li>
                                    <li>Experimenta con diferentes proporciones</li>
                                    <li>Documenta tus preferencias personales</li>
                                </ol>
                            `
                        },
                        {
                            icon: '🎯',
                            title: 'Balance y Ajuste',
                            content: `
                                <h4>El Arte del Balance</h4>
                                <p>Un cóctel perfecto equilibra dulzura, acidez, alcohol y amargura.</p>
                                
                                <h4>Componentes del Balance:</h4>
                                <ul>
                                    <li><strong>Dulzura:</strong> Jarabes, licores, frutas</li>
                                    <li><strong>Acidez:</strong> Cítricos, vinagres</li>
                                    <li><strong>Alcohol:</strong> Base y fuerza</li>
                                    <li><strong>Amargura:</strong> Bitters, campari</li>
                                    <li><strong>Sal:</strong> Sal marina, umami</li>
                                </ul>
                                
                                <h4>Técnicas de Ajuste:</h4>
                                <ul>
                                    <li><strong>Demasiado dulce:</strong> Más cítrico o bitters</li>
                                    <li><strong>Demasiado ácido:</strong> Más jarabe o licor dulce</li>
                                    <li><strong>Demasiado fuerte:</strong> Más mixer o diluir</li>
                                    <li><strong>Plano:</strong> Más bitters o cítricos</li>
                                </ul>
                                
                                <h4>Reglas de Oro:</h4>
                                <ul>
                                    <li>Probar siempre antes de servir</li>
                                    <li>Ajustar incrementalmente</li>
                                    <li>Considerar el gusto del cliente</li>
                                    <li>Mantener la integridad del cóctel</li>
                                </ul>
                                
                                <h4>Testing Method:</h4>
                                <ol>
                                    <li>Preparar cóctel estándar</li>
                                    <li>Probar y analizar componentes</li>
                                    <li>Ajustar un componente a la vez</li>
                                    <li>Probar después de cada ajuste</li>
                                    <li>Documentar la fórmula final</li>
                                </ol>
                            `,
                            exercises: `
                                <ol>
                                    <li>Practica ajuste de balance en 3 cócteles</li>
                                    <li>Crea una variación personal de un clásico</li>
                                    <li>Desarrolla tu método de testing</li>
                                </ol>
                            `
                        }
                    ]
                },
                '1.6': {
                    title: 'Clásicos Absolutos',
                    sections: [
                        {
                            icon: '🍸',
                            title: 'Los 10 Cócteles Imprescindibles',
                            content: `
                                <h4>La Base de la Mixología</h4>
                                <p>Estos 10 cócteles forman el fundamento de toda mixología profesional. Dominarlos es esencial.</p>
                                
                                <h4>1. Old Fashioned</h4>
                                <ul>
                                    <li>2 oz Bourbon o Rye</li>
                                    <li>1 azúcar</li>
                                    <li>2-3 dashes Angostura bitters</li>
                                    <li>1 splash water</li>
                                    <li>Orange peel garnish</li>
                                </ul>
                                
                                <h4>2. Martini</h4>
                                <ul>
                                    <li>2.5 oz Gin o Vodka</li>
                                    <li>0.5 oz Vermouth Dry</li>
                                    <li>1-2 dashes Orange bitters</li>
                                    <li>Lemon twist garnish</li>
                                </ul>
                                
                                <h4>3. Manhattan</h4>
                                <ul>
                                    <li>2 oz Rye Whisky</li>
                                    <li>1 oz Sweet Vermouth</li>
                                    <li>2 dashes Angostura bitters</li>
                                    <li>Maraschino cherry garnish</li>
                                </ul>
                                
                                <h4>4. Daiquiri</h4>
                                <ul>
                                    <li>2 oz White Rum</li>
                                    <li>1 oz Lime juice</li>
                                    <li>0.75 oz Simple syrup</li>
                                    <li>Lime wheel garnish</li>
                                </ul>
                                
                                <h4>5. Whiskey Sour</h4>
                                <ul>
                                    <li>2 oz Bourbon</li>
                                    <li>0.75 oz Lemon juice</li>
                                    <li>0.5 oz Simple syrup</li>
                                    <li>Egg white opcional</li>
                                    <li>Cherry and orange garnish</li>
                                </ul>
                                
                                <h4>6. Margarita</h4>
                                <ul>
                                    <li>2 oz Tequila Blanco</li>
                                    <li>1 oz Lime juice</li>
                                    <li>1 oz Cointreau</li>
                                    <li>Salt rim</li>
                                    <li>Lime wheel garnish</li>
                                </ul>
                                
                                <h4>7. Negroni</h4>
                                <ul>
                                    <li>1 oz Gin</li>
                                    <li>1 oz Campari</li>
                                    <li>1 oz Sweet Vermouth</li>
                                    <li>Orange peel garnish</li>
                                </ul>
                                
                                <h4>8. Mojito</h4>
                                <ul>
                                    <li>2 oz White Rum</li>
                                    <li>1 oz Lime juice</li>
                                    <li>0.5 oz Simple syrup</li>
                                    <li>6-8 mint leaves</li>
                                    <li>Soda water</li>
                                    <li>Mint sprig garnish</li>
                                </ul>
                                
                                <h4>9. Gimlet</h4>
                                <ul>
                                    <li>2 oz Gin</li>
                                    <li>1 oz Lime cordial</li>
                                    <li>Lime wheel garnish</li>
                                </ul>
                                
                                <h4>10. Sidecar</h4>
                                <ul>
                                    <li>2 oz Cognac</li>
                                    <li>0.75 oz Cointreau</li>
                                    <li>0.75 oz Lemon juice</li>
                                    <li>Sugar rim</li>
                                    <li>Lemon twist garnish</li>
                                </ul>
                            `,
                            exercises: `
                                <ol>
                                    <li>Prepara los 10 cócteles clásicos</li>
                                    <li>Compara técnicas y proporciones</li>
                                    <li>Documenta tus preferencias personales</li>
                                </ol>
                            `
                        },
                        {
                            icon: '🎓',
                            title: 'Técnicas de Ejecución Perfecta',
                            content: `
                                <h4>Consistencia es Clave</h4>
                                <p>Un gran barman puede replicar el mismo cóctel perfectamente cada vez.</p>
                                
                                <h4>Workflow Estándar:</h4>
                                <ol>
                                    <li>Leer la receta completamente</li>
                                    <li>Preparar station y herramientas</li>
                                    <li>Medir todos los ingredientes</li>
                                    <li>Preparar garnish</li>
                                    <li>Enfriar vaso</li>
                                    <li>Ejecutar técnica principal</li>
                                    <li>Colar y servir</li>
                                    <li>Agregar garnish</li>
                                    <li>Limpiar station</li>
                                </ol>
                                
                                <h4>Quality Control:</h4>
                                <ul>
                                    <li>Verificar frescura de ingredientes</li>
                                    <li>Calibrar medidas</li>
                                    <li>Probar antes de servir</li>
                                    <li>Ajustar si necesario</li>
                                    <li>Presentación impecable</li>
                                </ul>
                                
                                <h4>Speed vs Quality:</h4>
                                <ul>
                                    <li>Practicar lentamente primero</li>
                                    <li>Desarrollar muscle memory</li>
                                    <li>Optimizar movimientos</li>
                                    <li>Mantener calidad</li>
                                    <li>Aumentar velocidad gradualmente</li>
                                </ul>
                                
                                <h4>Common Mistakes to Avoid:</h4>
                                <ul>
                                    <li>Saltar pasos de preparación</li>
                                    <li>No medir correctamente</li>
                                    <li>Usar ingredientes viejos</li>
                                    <li>No probar antes de servir</li>
                                    <li>Presentación descuidada</li>
                                </ul>
                            `,
                            exercises: `
                                <ol>
                                    <li>Practica workflow con 5 cócteles</li>
                                    <li>Cronometra tu preparación</li>
                                    <li>Identifica áreas de mejora</li>
                                </ol>
                            `
                        },
                        {
                            icon: '🏆',
                            title: 'Variaciones y Creatividad',
                            content: `
                                <h4>Una vez dominados los clásicos...</h4>
                                <p>La creatividad florece sobre una base sólida de técnicas clásicas.</p>
                                
                                <h4>Principios de Variación:</h4>
                                <ul>
                                    <li>Cambiar un ingrediente principal</li>
                                    <li>Ajustar proporciones</li>
                                    <li>Añadir nuevo elemento</li>
                                    <li>Modificar técnica</li>
                                    <li>Experimentar con garnish</li>
                                </ul>
                                
                                <h4>Ejemplos de Variaciones Exitosas:</h4>
                                <ul>
                                    <li><strong>Espresso Martini:</strong> Add espresso to classic</li>
                                    <li><strong>Penicillin:</strong> Whiskey sour con ginger e honey</li>
                                    <li><strong>Paper Plane:</strong> Bourbon variation de Last Word</li>
                                    <li><strong>Gold Rush:</strong> Whiskey sour con honey</li>
                                </ul>
                                
                                <h4>Reglas para Creación:</h4>
                                <ul>
                                    <li>Entender el clásico original</li>
                                    <li>Mantener balance fundamental</li>
                                    <li>No sobrecargar con ingredientes</li>
                                    <li>Probar extensivamente</li>
                                    <li>Documentar la fórmula</li>
                                </ul>
                                
                                <h4>Developing Your Style:</h4>
                                <ul>
                                    <li>Identificar preferencias personales</li>
                                    <li>Estudiar cócteles contemporáneos</li>
                                    <li>Experimentar con ingredientes locales</li>
                                    <li>Crear signature cocktails</li>
                                    <li>Obtener feedback y ajustar</li>
                                </ul>
                            `,
                            exercises: `
                                <ol>
                                    <li>Crea 3 variaciones de clásicos</li>
                                    <li>Desarrolla un cóctel signature</li>
                                    <li>Documenta tus creaciones</li>
                                </ol>
                            `
                        }
                    ]
                }
            },
            'avanzadas': {
                '2.1': {
                    title: 'Mixología Molecular',
                    sections: [
                        {
                            icon: '🔬',
                            title: 'Fundamentos de Mixología Molecular',
                            content: `
                                <h4>¿Qué es la Mixología Molecular?</h4>
                                <p>Es la aplicación de principios químicos y físicos a la preparación de cócteles. Transforma texturas, sabores y presentaciones usando técnicas científicas.</p>
                                
                                <h4>Historia y Orígenes:</h4>
                                <p>Popularizada por chefs como Ferran Adrià en elBulli, la mixología molecular llegó a los cócteles a través de bartenders innovadores como Tony Conigliaro y Grant Achatz.</p>
                                
                                <h4>Principios Básicos:</h4>
                                <ul>
                                    <li><strong>Sferificación:</strong> Creación de esferas líquidas con membrana gelatinosa</li>
                                    <li><strong>Espumas:</strong> Texturas ligeras y aéreas mediante aireación</li>
                                    <li><strong>Geles:</strong> Consistencia semisólida controlada</li>
                                    <li><strong>Emulsiones:</strong> Mezcla estable de líquidos inmiscibles</li>
                                    <li><strong>Clarificación:</strong> Eliminación de partículas para transparencia</li>
                                </ul>
                                
                                <h4>Ingredientes Clave:</h4>
                                <ul>
                                    <li><strong>Alginato de Sodio:</strong> Polisacárido para esferificación</li>
                                    <li><strong>Cloruro de Calcio:</strong> Agente gelificante para alginato</li>
                                    <li><strong>Lechitina de Soja:</strong> Emulsionante natural para espumas</li>
                                    <li><strong>Agar-Agar:</strong> Gelificante vegetal de origen marino</li>
                                    <li><strong>Xantana:</strong> Espesante y estabilizante</li>
                                    <li><strong>Pectina:</strong> Gelificante de frutas</li>
                                </ul>
                                
                                <h4>Seguridad y Manipulación:</h4>
                                <ul>
                                    <li>Usar guantes y máscara para polvos</li>
                                    <li>Etiquetar claramente todos los ingredientes</li>
                                    <li>Mantener fuera del alcance de niños</li>
                                    <li>Limpiar superficies después del uso</li>
                                </ul>
                            `,
                            exercises: `
                                <ol>
                                    <li>Prepara una esfera básica de jugo de naranja</li>
                                    <li>Crea una espuma de gin con lecitina</li>
                                    <li>Experimenta con diferentes concentraciones de alginato</li>
                                    <li>Documenta resultados y ajustes necesarios</li>
                                </ol>
                            `
                        },
                        {
                            icon: '🧪',
                            title: 'Técnicas de Esferificación',
                            content: `
                                <h4>Esferificación Básica</h4>
                                <p>Creación de esferas líquidas con membrana delgada que explotan en la boca.</p>
                                
                                <h4>Proceso Paso a Paso:</h4>
                                <ol>
                                    <li>Preparar solución de alginato (0.5-2%)</li>
                                    <li>Dejar reposar 24 horas para eliminar burbujas</li>
                                    <li>Preparar baño de cloruro de calcio (0.5-1%)</li>
                                    <li>Usar jeringa o cuchara para gotear en baño</li>
                                    <li>Esperar 1-2 minutos para formación de membrana</li>
                                    <li>Enjuagar con agua limpia</li>
                                    <li>Almacenar en el mismo líquido original</li>
                                </ol>
                                
                                <h4>Esferificación Inversa:</h4>
                                <ul>
                                    <li>Para líquidos con alto contenido de calcio</li>
                                    <li>Usar baño de alginato en lugar de calcio</li>
                                    <li>Resultados en esferas más delicadas</li>
                                    <li>Ideal para licores y jugos cítricos</li>
                                </ul>
                                
                                <h4>Consejos Profesionales:</h4>
                                <ul>
                                    <li>pH ideal: 3-6 para mejores resultados</li>
                                    <li>Temperatura: ambiente para consistencia óptima</li>
                                    <li>Tiempo: controlar para grosor de membrana</li>
                                    <li>Almacenamiento: máximo 24 horas</li>
                                </ul>
                                
                                <h4>Aplicaciones en Cócteles:</h4>
                                <ul>
                                    <li>Esferas de gin & tónico</li>
                                    <li>Perlas de mojito</li>
                                    <li>Caviar de margarita</li>
                                    <li>Esferas de whisky sour</li>
                                </ul>
                            `,
                            exercises: `
                                <ol>
                                    <li>Practica esferificación básica con jugo de manzana</li>
                                    <li>Experimenta con diferentes tiempos de inmersión</li>
                                    <li>Crea esferas de tamaño diferente</li>
                                    <li>Prueba esferificación inversa con licor</li>
                                </ol>
                            `
                        }
                    ]
                },
                '2.2': {
                    title: 'Infusiones y Maceraciones',
                    sections: [
                        {
                            icon: '🌿',
                            title: 'Infusiones Rápidas (Quick Infusions)',
                            content: `
                                <h4>¿Qué son las Infusiones Rápidas?</h4>
                                <p>Técnicas modernas que reducen el tiempo de infusión de semanas a minutos usando principios científicos.</p>
                                
                                <h4>Métodos Principales:</h4>
                                <ul>
                                    <li><strong>Vacuum Infusion:</strong> Usa presión negativa para acelerar</li>
                                    <li><strong>Sous Vide:</strong> Control preciso de temperatura</li>
                                    <li><strong>Agitación Mecánica:</strong> High-speed blending</li>
                                    <li><strong>Ultrasónico:</strong> Ondas sónicas para extracción</li>
                                </ul>
                                
                                <h4>Equipment Necesario:</h4>
                                <ul>
                                    <li><strong>Chamber Vacuum Sealer:</strong> Para infusión al vacío</li>
                                    <li><strong>Sous Vide Machine:</strong> Control de temperatura</li>
                                    <li><strong>High-Speed Blender:</strong> Agitación intensiva</li>
                                    <li><strong>Ultrasonic Cleaner:</strong> Infusión ultrasónica</li>
                                </ul>
                                
                                <h4>Tiempos de Infusión Comparativos:</h4>
                                <ul>
                                    <li><strong>Tradicional:</strong> 2-4 semanas</li>
                                    <li><strong>Vacuum:</strong> 30 minutos - 2 horas</li>
                                    <li><strong>Sous Vide:</strong> 1-4 horas</li>
                                    <li><strong>Blender:</strong> 5-15 minutos</li>
                                    <li><strong>Ultrasónico:</strong> 10-30 minutos</li>
                                </ul>
                                
                                <h4>Factores que Afectan la Infusión:</h4>
                                <ul>
                                    <li>Superficie de contacto (más = más rápido)</li>
                                    <li>Temperatura (mayor = más rápido)</li>
                                    <li>Agitación (constante = más rápido)</li>
                                    <li>Presión (vacío = más rápido)</li>
                                </ul>
                            `,
                            exercises: `
                                <ol>
                                    <li>Prepara infusión rápida de café con whisky</li>
                                    <li>Experimenta con diferentes tiempos de vacuum</li>
                                    <li>Compara resultados de métodos diferentes</li>
                                    <li>Documenta diferencias de sabor</li>
                                </ol>
                            `
                        },
                        {
                            icon: '🍓',
                            title: 'Maceraciones Creativas',
                            content: `
                                <h4>Principios de Maceración</h4>
                                <p>Extracción de sabores de sólidos en líquidos mediante tiempo y condiciones controladas.</p>
                                
                                <h4>Ingredientes para Macerar:</h4>
                                <ul>
                                    <li><strong>Frutas:</strong> Berries, cítricos, stone fruits</li>
                                    <li><strong>Hierbas:</strong> Menta, albahaca, romero, lavanda</li>
                                    <li><strong>Especias:</strong> Canela, cardamomo, vaina, pimienta</li>
                                    <li><strong>Nueces:</strong> Almendras, avellanas, pacanas</li>
                                    <li><strong>Chocolate:</strong> Cacao, nibs, chocolate</li>
                                    <li><strong>Té:</strong> Black, green, herbal teas</li>
                                </ul>
                                
                                <h4>Técnicas Avanzadas:</h4>
                                <ul>
                                    <li><strong>Fat Washing:</strong> Infusión en grasas, luego congelación</li>
                                    <li><strong>Enzymatic Maceration:</strong> Usa enzimas para romper fibras</li>
                                    <li><strong>Cryo-Maceration:</strong> Congelación y descongelación</li>
                                    <li><strong>Pressure Maceration:</strong> Alta presión para extracción</li>
                                </ul>
                                
                                <h4>Recetas de Maceración Exitosas:</h4>
                                <ul>
                                    <li><strong>Bacon Bourbon:</strong> 12 horas, filtrar y congelar</li>
                                    <li><strong>Vanilla Vodka:</strong> 2 vainas por 750ml, 1 semana</li>
                                    <li><strong>Jalapeño Tequila:</strong> 1-2 horas, remover semillas</li>
                                    <li><strong>Raspberry Gin:</strong> 24-48 horas, agitar diariamente</li>
                                    <li><strong>Cinnamon Whisky:</strong> 2-3 sticks, 1 semana</li>
                                </ul>
                                
                                <h4>Tips de Conservación:</h4>
                                <ul>
                                    <li>Filtrar con café o filtros finos</li>
                                    <li>Almacenar en botellas oscuras</li>
                                    <li>Etiquetar con fecha e ingredientes</li>
                                    <li>Consumir dentro de 3-6 meses</li>
                                </ul>
                            `,
                            exercises: `
                                <ol>
                                    <li>Prepara maceración de frutas con vodka</li>
                                    <li>Experimenta con fat washing</li>
                                    <li>Crea maceración de hierbas con gin</li>
                                    <li>Desarrolla tu receta original</li>
                                </ol>
                            `
                        }
                    ]
                },
                '2.3': {
                    title: 'Clarificación y Filtrado',
                    sections: [
                        {
                            icon: '💧',
                            title: 'Métodos de Clarificación',
                            content: `
                                <h4>¿Qué es la Clarificación?</h4>
                                <p>Proceso de eliminar partículas en suspensión para obtener cócteles cristalinos y texturas suaves.</p>
                                
                                <h4>Métodos Tradicionales:</h4>
                                <ul>
                                    <li><strong>Filtración Simple:</strong> Papel, tela, malla fina</li>
                                    <li><strong>Decantación:</strong> Gravedad y tiempo</li>
                                    <li><strong>Clarificación con Clara:</strong> Proteínas coagulan partículas</li>
                                    <li><strong>Gelatina:</strong> Adsorción de impurezas</li>
                                </ul>
                                
                                <h4>Técnicas Modernas:</h4>
                                <ul>
                                    <li><strong>Centrifugación:</strong> Fuerza centrífuga para separación</li>
                                    <li><strong>Ultrafiltración:</strong> Membranas de poros controlados</li>
                                    <li><strong>Clarificación por Enzimas:</strong> Pectinasa, amilasa</li>
                                    <li><strong>Agar Agar Method:</strong> Gelatinización y filtrado</li>
                                </ul>
                                
                                <h4>Agar Clarification Method:</h4>
                                <ol>
                                    <li>Agregar 0.5% agar agar al líquido</li>
                                    <li>Calentar hasta disolver completamente</li>
                                    <li>Enfriar hasta formar gel firme</li>
                                    <li>Romper el gel en trozos pequeños</li>
                                    <li>Colar a través de malla fina</li>
                                    <li>El líquido filtrado estará cristalino</li>
                                </ol>
                                
                                <h4>Milk Clarification:</h4>
                                <ol>
                                    <li>Calentar leche sin hervir</li>
                                    <li>Agregar cóctel caliente</li>
                                    <li>Cuajará formando cuajada</li>
                                    <li>Filtrar a través de tela fina</li>
                                    <li>Resulta en líquido transparente</li>
                                </ul>
                            `,
                            exercises: `
                                <ol>
                                    <li>Clarifica jugo de piña con agar agar</li>
                                    <li>Practica milk clarification</li>
                                    <li>Compara métodos diferentes</li>
                                    <li>Documenta claridad y sabor</li>
                                </ol>
                            `
                        },
                        {
                            icon: '🔍',
                            title: 'Filtrado Avanzado',
                            content: `
                                <h4>Niveles de Filtrado:</h4>
                                <ul>
                                    <li><strong>Grueso:</strong> Malla metálica, colador normal</li>
                                    <li><strong>Medio:</strong> Papel café, tela fina</li>
                                    <li><strong>Fino:</strong> Filtros de laboratorio, carbon activado</li>
                                    <li><strong>Ultrafino:</strong> Membranas de 0.2 micras</li>
                                </ul>
                                
                                <h4>Equipment de Filtrado:</h4>
                                <ul>
                                    <li><strong>Chemex:</strong> Filtros de café gruesos</li>
                                    <li><strong>V60:</strong> Filtros de papel controlados</li>
                                    <li><strong>Buchner Funnel:</strong> Filtración al vacío</li>
                                    <li><strong>Filter Press:</strong> Presión mecánica</li>
                                </ul>
                                
                                <h4>Técnicas Específicas:</h4>
                                <ul>
                                    <li><strong>Double Filtration:</strong> Dos etapas para máxima claridad</li>
                                    <li><strong>Cold Filtration:</strong> Bajas temperaturas para cristalización</li>
                                    <li><strong>Carbon Filtration:</strong> Remover colores y olores</li>
                                    <li><strong>Chill Filtering:</strong> Congelar y filtrar simultáneamente</li>
                                </ul>
                                
                                <h4>Aplicaciones Prácticas:</h4>
                                <ul>
                                    <li>Whisky clarificado para cócteles suaves</li>
                                    <li>Jugos clarificados para presentación</li>
                                    <li>Infusiones clarificadas para pureza</li>
                                    <li>Syrups clarificados para transparencia</li>
                                </ul>
                                
                                <h4>Consideraciones de Sabor:</h4>
                                <ul>
                                    <li>La filtración puede remover compuestos de sabor</li>
                                    <li>Balance entre claridad y retención de sabor</li>
                                    <li>Probar antes y después de filtrar</li>
                                    <li>Ajustar recetas según pérdida de sabor</li>
                                </ul>
                            `,
                            exercises: `
                                <ol>
                                    <li>Filtra whisky usando diferentes métodos</li>
                                    <li>Prepara jugo clarificado double filtrado</li>
                                    <li>Experimenta con carbon filtration</li>
                                    <li>Compara resultados de sabor</li>
                                </ol>
                            `
                        }
                    ]
                },
                '2.4': {
                    title: 'Syphons y Carbonatación',
                    sections: [
                        {
                            icon: '🫧',
                            title: 'Uso de Sifones',
                            content: `
                                <h4>¿Qué es un Sifón?</h4>
                                <p>Dispositivo que usa CO2 para crear espumas y texturas ligeras mediante carbonatación y presión.</p>
                                
                                <h4>Tipos de Sifones:</h4>
                                <ul>
                                    <li><strong>0.5L:</strong> Para pequeñas cantidades, experimentos</li>
                                    <li><strong>1L:</strong> Estándar para uso profesional</li>
                                    <li><strong>2L:</strong> Para grandes volúmenes</li>
                                    <li><strong>Whipper:</strong> Para cremas y espumas densas</li>
                                </ul>
                                
                                <h4>Cargas de CO2:</h4>
                                <ul>
                                    <li><strong>Standard:</strong> 8g CO2 para 1L</li>
                                    <li><strong>Extra:</strong> 16g CO2 para más carbonatación</li>
                                    <li><strong>N2O:</strong> Para cremas y texturas suaves</li>
                                </ul>
                                
                                <h4>Técnica Básica:</h4>
                                <ol>
                                    <li>Enfriar sifón en refrigerador 2 horas</li>
                                    <li>Preparar mezcla líquida fría</li>
                                    <li>Cargar en sifón hasta marca máxima</li>
                                    <li>Sellar y cargar con cartucho CO2</li>
                                    <li>Agitar suavemente 5-10 veces</li>
                                    <li>Refrigerar 1 hora mínimo</li>
                                    <li>Servir con boquilla apropiada</li>
                                </ol>
                                
                                <h4>Recetas para Sifón:</h4>
                                <ul>
                                    <li><strong>Gin & Tonic Espumoso:</strong> Gin, tonic, goma arábiga</li>
                                    <li><strong>Whiskey Sour Espuma:</strong> Whiskey, limón, clara de huevo</li>
                                    <li><strong>Coco Espuma:</strong> Coco, azúcar, clara</li>
                                    <li><strong>Frutas Espuma:</strong> Puré, azúcar, gelatina</li>
                                </ul>
                                
                                <h4>Mantenimiento:</h4>
                                <ul>
                                    <li>Limpiar después de cada uso</li>
                                    <li>No usar con partículas grandes</li>
                                    <li>Reemplazar juntas cada 6 meses</li>
                                    <li>Almacenar vacío y limpio</li>
                                </ul>
                            `,
                            exercises: `
                                <ol>
                                    <li>Prepara gin & tónico espumoso</li>
                                    <li>Experimenta con diferentes CO2 loads</li>
                                    <li>Crea espuma de frutas</li>
                                    <li>Compara texturas obtenidas</li>
                                </ol>
                            `
                        },
                        {
                            icon: '🥤',
                            title: 'Carbonatación Controlada',
                            content: `
                                <h4>Principios de Carbonatación</h4>
                                <p>Disolución de CO2 en líquidos bajo presión creando burbujas y sensación de frescura.</p>
                                
                                <h4>Factores que Afectan la Carbonatación:</h4>
                                <ul>
                                    <li><strong>Temperatura:</strong> Más frío = más CO2 disuelto</li>
                                    <li><strong>Presión:</strong> Mayor presión = más carbonatación</li>
                                    <li><strong>Superficie:</strong> Más superficie = más rápida disolución</li>
                                    <li><strong>Azúcar:</strong> Mayor contenido = más nucleación</li>
                                </ul>
                                
                                <h4>Métodos de Carbonatación:</h4>
                                <ul>
                                    <li><strong>Sifón:</strong> CO2 directo bajo presión</li>
                                    <li><strong>Carbonator:</strong> Máquina especializada</li>
                                    <li><strong>Keg System:</strong> Barriles con CO2</li>
                                    <li><strong>Bottle Conditioning:</strong> Fermentación secundaria</li>
                                </ul>
                                
                                <h4>Técnica de Carbonatación Perfecta:</h4>
                                <ol>
                                    <li>Enfriar líquido a 2-4°C</li>
                                    <li>Calcular CO2 necesario (2-3 volúmenes)</li>
                                    <li>Aplicar presión gradualmente</li>
                                    <li>Agitar suavemente para acelerar</li>
                                    <li>Mantener presión 24 horas</li>
                                    <li>Refrigerar hasta servicio</li>
                                </ol>
                                
                                <h4>Cócteles Carbonatados Exitosos:</h4>
                                <ul>
                                    <li><strong>Carbonated Negroni:</strong> Clásico con burbujas</li>
                                    <li><strong>Fizzy Margarita:</strong> Refrescante y ácido</li>
                                    <li><strong>Sparkling Old Fashioned:</strong> Whisky con carbonatación</li>
                                    <li><strong>Bubbly Moscow Mule:</strong> Extra fizz</li>
                                </ul>
                                
                                <h4>Guarnishes para Cócteles Carbonatados:</h4>
                                <ul>
                                    <li>Evitar elementos que se disuelvan rápido</li>
                                    <li>Usar frutas frescas y firmes</li>
                                    <li>Considerar efecto de burbujas en presentación</li>
                                    <li>Agregar garnish justo antes de servir</li>
                                </ul>
                            `,
                            exercises: `
                                <ol>
                                    <li>Carbonata un cóctel clásico</li>
                                    <li>Experimenta con diferentes volúmenes de CO2</li>
                                    <li>Compara carbonatación fría vs caliente</li>
                                    <li>Crea cóctel carbonatado original</li>
                                </ol>
                            `
                        }
                    ]
                },
                '2.5': {
                    title: 'Balance de Sabores Avanzado',
                    sections: [
                        {
                            icon: '🎭',
                            title: 'Teoría del Sabor',
                            content: `
                                <h4>Los Cinco Sabores Básicos:</h4>
                                <ul>
                                    <li><strong>Dulce:</strong> Azúcares, frutas, miel</li>
                                    <li><strong>Ácido:</strong> Cítricos, vinagres, fermentados</li>
                                    <li><strong>Salado:</strong> Sal, umami, minerales</li>
                                    <li><strong>Amargo:</strong> Bitters, cáscaras, vegetales</li>
                                    <li><strong>Umami:</strong> Glutamato, fermentados, algas</li>
                                </ul>
                                
                                <h4>Percepción del Sabor:</h4>
                                <ul>
                                    <li><strong>Lengua:</strong> Receptores específicos por zona</li>
                                    <li><strong>Nariz:</strong> Aromas influyen en 80% del sabor</li>
                                    <li><strong>Textura:</strong> Bocafeel afecta percepción</li>
                                    <li><strong>Temperatura:</strong> Modifica intensidad</li>
                                </ul>
                                
                                <h4>Interacciones de Sabores:</h4>
                                <ul>
                                    <li><strong>Contraste:</strong> Dulce vs ácido crea balance</li>
                                    <li><strong>Complemento:</strong> Sabores similares se potencian</li>
                                    <li><strong>Supresión:</strong> Un sabor enmascara otro</li>
                                    <li><strong>Enhancement:</strong> Un sabor realza otro</li>
                                </ul>
                                
                                <h4>Psicología del Sabor:</h4>
                                <ul>
                                    <li><strong>Expectativa:</strong> Influencia en percepción</li>
                                    <li><strong>Color:</strong> Afecta interpretación del sabor</li>
                                    <li><strong>Presentación:</strong> Modifica experiencia</li>
                                    <li><strong>Contexto:</strong> Ambiente y compañía</li>
                                </ul>
                                
                                <h4>Adaptación del Paladar:</h4>
                                <ul>
                                    <li>Sensibilidad disminuye con exposición</li>
                                    <li>Recuperación en 10-15 minutos</li>
                                    <li>Limpiar con agua neutral entre pruebas</li>
                                    <li>Evitar fatiga del paladar</li>
                                </ul>
                            `,
                            exercises: `
                                <ol>
                                    <li>Analiza perfil de sabor de 5 licores</li>
                                    <li>Experimenta con interacciones de sabores</li>
                                    <li>Prueba adaptación del paladar</li>
                                    <li>Documenta percepciones sensoriales</li>
                                </ol>
                            `
                        },
                        {
                            icon: '⚖️',
                            title: 'Técnicas de Ajuste Fino',
                            content: `
                                <h4>Método Científico de Balance:</h4>
                                <ol>
                                    <li>Establecer punto de referencia</li>
                                    <li>Identificar componente dominante</li>
                                    <li>Ajustar incrementalmente</li>
                                    <li>Probar y documentar cambios</li>
                                    <li>Repetir hasta balance óptimo</li>
                                </ol>
                                
                                <h4>Herramientas de Ajuste:</h4>
                                <ul>
                                    <li><strong>Dash Bottle:</strong> Control preciso de bitters</li>
                                    <li><strong>Pipettes:</strong> Medición en gotas</li>
                                    <li><strong>Mini Jiggers:</strong> Pequeñas cantidades</li>
                                    <li><strong>Syrup Dispensers:</strong> Control de flujo</li>
                                </ul>
                                
                                <h4>Ajustes Específicos:</h4>
                                <ul>
                                    <li><strong>Dulzura:</strong> 0.25ml increments de syrup</li>
                                    <li><strong>Acidez:</strong> 2-3 drops de cítrico</li>
                                    <li><strong>Amargura:</strong> 1 dash de bitters</li>
                                    <li><strong>Sal:</strong> Pincha de sal marina</li>
                                    <li><strong>Umami:</strong> 1 dash de Worcestershire</li>
                                </ul>
                                
                                <h4>Balance por Categoria de Cóctel:</h4>
                                <ul>
                                    <li><strong>Sours:</strong> 2:1:1 base:dulce:ácido</li>
                                    <li><strong>Old Fashioned:</strong> 2:1:0.25 whisky:azúcar:bitters</li>
                                    <li><strong>Manhattan:</strong> 2:1:0.1 whisky:vermouth:bitters</li>
                                    <li><strong>Negroni:</strong> 1:1:1 gin:campari:vermouth</li>
                                </ul>
                                
                                <h4>Troubleshooting Common Issues:</h4>
                                <ul>
                                    <li><strong>Demasiado dulce:</strong> Agregar ácido o bitters</li>
                                    <li><strong>Demasiado ácido:</strong> Agregar dulce o sal</li>
                                    <li><strong>Plano:</strong> Agregar bitters y cítrico</li>
                                    <li><strong>Demasiado fuerte:</strong> Diluir o agregar dulce</li>
                                    <li><strong>Desbalanceado:</strong> Reevaluar proporciones base</li>
                                </ul>
                            `,
                            exercises: `
                                <ol>
                                    <li>Ajusta balance de cóctel existente</li>
                                    <li>Practica ajustes incrementales</li>
                                    <li>Desarrolla método personal de testing</li>
                                    <li>Crea guía de troubleshooting</li>
                                </ol>
                            `
                        }
                    ]
                },
                '2.6': {
                    title: 'Cócteles Contemporáneos',
                    sections: [
                        {
                            icon: '🏙️',
                            title: 'Análisis de Cócteles de Renombre',
                            content: `
                                <h4>Death & Co (New York)</h4>
                                <ul>
                                    <li><strong>Oaxaca Old Fashioned:</strong> Mezcal, agave, bitters</li>
                                    <li><strong>Paper Plane:</strong> Bourbon, Aperol, Amaro Nonino, lemon</li>
                                    <li><strong>Ward Eight:</strong> Rye, lemon, grenadine, bitters</li>
                                </ul>
                                
                                <h4>The Dead Rabbit (New York)</h4>
                                <ul>
                                    <li><strong>Goody Two Shoes:</strong> Rye, benedictine, cherry, bitters</li>
                                    <li><strong>Spice Lane:</strong> Rum, apricot, lime, velvet falernum</li>
                                    <li><strong>Punch Romaine:</strong> Champagne, rum, citrus, herbs</li>
                                </ul>
                                
                                <h4>Connaught Bar (London)</h4>
                                <ul>
                                    <li><strong>Connaught Martini:</strong> Gin, vermouth, bitters</li>
                                    <li><strong>Old Cuban:</strong> Rum, lime, champagne, bitters</li>
                                    <li><strong>20th Century:</strong> Gin, kummel, violet, lemon</li>
                                </ul>
                                
                                <h4>American Bar (Savoy, London)</h4>
                                <ul>
                                    <li><strong>Corpse Reviver #2:</strong> Gin, lillet, cocchi, lemon</li>
                                    <li><strong>Blackthorn:</strong> Sloe gin, vermouth, bitters</li>
                                    <li><strong>Queen's Hope:</strong> Gin, maraschino, lemon, bitters</li>
                                </ul>
                                
                                <h4>Hi-Spirits (Tokyo)</h4>
                                <ul>
                                    <li><strong>Bamboo:</strong> Sherry, vermouth, bitters</li>
                                    <li><strong>Adonis:</strong> Sherry, sweet vermouth, orange bitters</li>
                                    <li><strong>Bijou:</strong> Gin, chartreuse, vermouth</li>
                                </ul>
                            `,
                            exercises: `
                                <ol>
                                    <li>Reproduce 3 cócteles de bares famosos</li>
                                    <li>Analiza estructura y balance</li>
                                    <li>Identifica técnicas innovadoras</li>
                                    <li>Documenta aprendizajes clave</li>
                                </ol>
                            `
                        },
                        {
                            icon: '🔬',
                            title: 'Técnicas Innovadoras',
                            content: `
                                <h4>Rotational Evaporation:</h4>
                                <ul>
                                    <li>Extraer aromas sin calor</li>
                                    <li>Concentrar sabores delicados</li>
                                    <li>Crear esencias puras</li>
                                    <li>Aplicación: aromas de cóctel</li>
                                </ul>
                                
                                <h4>Spherification Avanzada:</h4>
                                <ul>
                                    <li>Esferas de cóctel completas</li>
                                    <li>Cápsulas de sabor burst</li>
                                    <li>Caviar de cóctel</li>
                                    <li>Perlas líquidas</li>
                                </ul>
                                
                                <h4>Flash Freezing:</h4>
                                <ul>
                                    <li>Congelación instantánea con nitrógeno</li>
                                    <li>Texturas granizadas</li>
                                    <li>Cócteles congelados al momento</li>
                                    <li>Presentaciones espectaculares</li>
                                </ul>
                                
                                <h4>Deconstructed Cocktails:</h4>
                                <ul>
                                    <li>Separar componentes del cóctel</li>
                                    <li>Presentar elementos individuales</li>
                                    <li>Experiencia interactiva</li>
                                    <li>Educación sobre ingredientes</li>
                                </ul>
                                
                                <h4>Smoke Infusion:</h4>
                                <ul>
                                    <li>Humo de madera, hierbas, especias</li>
                                    <li>Infusión por cámara de humo</li>
                                    <li>Aromas complejos</li>
                                    <li>Presentación dramática</li>
                                </ul>
                                
                                <h4>3D Printing Garnishes:</h4>
                                <ul>
                                    <li>Garnishes personalizados</li>
                                    <li>Formas imposibles manualmente</li>
                                    <li>Azúcar isomalt impresa</li>
                                    <li>Elementos comestibles únicos</li>
                                </ul>
                            `,
                            exercises: `
                                <ol>
                                    <li>Experimenta con smoke infusion</li>
                                    <li>Practica deconstructed cocktail</li>
                                    <li>Investiga técnicas de vanguardia</li>
                                    <li>Crea presentación innovadora</li>
                                </ol>
                            `
                        }
                    ]
                },
                '2.7': {
                    title: 'Creación de Recetas',
                    sections: [
                        {
                            icon: '💡',
                            title: 'Metodología de Creación',
                            content: `
                                <h4>Fase 1: Inspiración y Concepto</h4>
                                <ul>
                                    <li>Investigar ingredientes disponibles</li>
                                    <li>Identificar tema o inspiración</li>
                                    <li>Definir perfil de sabor deseado</li>
                                    <li>Considerar presentación final</li>
                                </ul>
                                
                                <h4>Fase 2: Desarrollo Base</h4>
                                <ul>
                                    <li>Seleccionar licor base apropiado</li>
                                    <li>Elegir técnica de preparación</li>
                                    <li>Establecer proporciones iniciales</li>
                                    <li>Crear prototipo básico</li>
                                </ul>
                                
                                <h4>Fase 3: Refinamiento</h4>
                                <ul>
                                    <li>Probar y analizar componentes</li>
                                    <li>Ajustar balance incrementalmente</li>
                                    <li>Experimentar con variaciones</li>
                                    <li>Documentar cada cambio</li>
                                </ul>
                                
                                <h4>Fase 4: Finalización</h4>
                                <ul>
                                    <li>Perfeccionar presentación</li>
                                    <li>Desarrollar garnish apropiado</li>
                                    <li>Escribir receta final</li>
                                    <li>Crear nombre y historia</li>
                                </ul>
                                
                                <h4>Fase 5: Testing</h4>
                                <ul>
                                    <li>Probar con diferentes paladares</li>
                                    <li>Ajustar según feedback</li>
                                    <li>Verificar consistencia</li>
                                    <li>Validar reproducibilidad</li>
                                </ul>
                                
                                <h4>Principios de Diseño:</h4>
                                <ul>
                                    <li>Balance es fundamental</li>
                                    <li>Simplicidad sobre complejidad</li>
                                    <li>Originalidad con propósito</li>
                                    <li>Reproducibilidad es clave</li>
                                </ul>
                            `,
                            exercises: `
                                <ol>
                                    <li>Desarrolla cóctel usando metodología completa</li>
                                    <li>Documenta cada fase del proceso</li>
                                    <li>Obtén feedback de múltiples personas</li>
                                    <li>Refina basado en resultados</li>
                                </ol>
                            `
                        },
                        {
                            icon: '🎨',
                            title: 'Desarrollo de Estilo Personal',
                            content: `
                                <h4>Identificar tu Voz Creativa:</h4>
                                <ul>
                                    <li>Analizar preferencias personales</li>
                                    <li>Reconocer fortalezas técnicas</li>
                                    <li>Identificar ingredientes favoritos</li>
                                    <li>Definir filosofía de cócteles</li>
                                </ul>
                                
                                <h4>Estilos de Creación:</h4>
                                <ul>
                                    <li><strong>Clásico Modernizado:</strong> Base tradicional con twist</li>
                                    <li><strong>Tematico:</strong> Inspirado en lugar, época, cultura</li>
                                    <li><strong>Técnico:</strong> Enfoque en método específico</li>
                                    <li><strong>Ingredient-Driven:</strong> Protagoniza un ingrediente</li>
                                    <li><strong>Seasonal:</strong> Basado en ingredientes de temporada</li>
                                </ul>
                                
                                <h4>Building Your Portfolio:</h4>
                                <ul>
                                    <li>Crear 5-10 cócteles signature</li>
                                    <li>Desarrollar variaciones de clásicos</li>
                                    <li>Inventar técnicas originales</li>
                                    <li>Crear sistema de naming consistente</li>
                                </ul>
                                
                                <h4>Documentación Profesional:</h4>
                                <ul>
                                    <li>Recetas estandarizadas</li>
                                    <li>Fotografía profesional</li>
                                    <li>Historia y concepto</li>
                                    <li>Técnica y presentación</li>
                                </ul>
                                
                                <h4>Networking y Comunidad:</h4>
                                <ul>
                                    <li>Compartir creaciones en redes</li>
                                    <li>Participar en competencias</li>
                                    <li>Colaborar con otros bartenders</li>
                                    <li>Buscar mentoría y feedback</li>
                                </ul>
                                
                                <h4>Evolución Continua:</h4>
                                <ul>
                                    <li>Revisar y refinar recetas regularmente</li>
                                    <li>Experimentar con nuevas técnicas</li>
                                    <li>Mantenerse actualizado con tendencias</li>
                                    <li>Desarrollar constantemente nuevas ideas</li>
                                </ul>
                            `,
                            exercises: `
                                <ol>
                                    <li>Define tu estilo personal de creación</li>
                                    <li>Crea portfolio de 5 cócteles signature</li>
                                    <li>Desarrolla sistema de documentación</li>
                                    <li>Planifica evolución futura</li>
                                </ol>
                            `
                        }
                    ]
                }
            },
            cristaleria: {
                '3.1': {
                    title: 'Tipos de Cristalería',
                    sections: [
                        {
                            icon: '🥃',
                            title: 'Vasos Clásicos',
                            content: `
                                <h4>Old Fashioned Glass (Rocks Glass)</h4>
                                <p>Vaso corto y robusto (180-300ml). Ideal para cócteles servidos "on the rocks". Perfecto para Old Fashioned, Negroni, Whiskey Sour.</p>
                                
                                <h4>Highball Glass</h4>
                                <p>Vaso alto y delgado (240-350ml). Diseñado para cócteles con hielo y mezclas largas. Ideal para Gin & Tonic, Mojito, Tom Collins.</p>
                                
                                <h4>Coupe Glass</h4>
                                <p>Vaso ancho y poco profundo (120-180ml). Elegante y clásico. Perfecto para Sidecar, Daiquiri, Aviation.</p>
                                
                                <h4>Martini Glass</h4>
                                <p>Vaso triangular icónico (90-150ml). Símbolo de sofisticación. Ideal para Martini, Espresso Martini, Gibson.</p>
                            `,
                            exercises: `
                                <ol>
                                    <li>Identifica 5 cócteles y su vaso apropiado</li>
                                    <li>Explica por qué cada vaso es ideal para ciertos cócteles</li>
                                    <li>Practica servir el mismo cóctel en diferentes vasos</li>
                                </ol>
                            `
                        }
                    ]
                },
                '3.2': {
                    title: 'Temperatura y Hielo',
                    sections: [
                        {
                            icon: '🧊',
                            title: 'Tipos de Hielo',
                            content: `
                                <h4>Hielo Regular (Cubos)</h4>
                                <p>Cubos estándar (2x2cm). Versátil para la mayoría de cócteles. Se derrite moderadamente.</p>
                                
                                <h4>Hielo en Esferas</h4>
                                <p>Grandes esferas (5-6cm). Se derrite lentamente. Ideal para cócteles servidos "on the rocks".</p>
                                
                                <h4>Hielo Crushed (Picado)</h4>
                                <p>Hielo triturado fino. Para juleps, swizzles, y cócteles tropicales. Máxima superficie de contacto.</p>
                                
                                <h4>Hielo Collins</h4>
                                <p>Varitas largas y delgadas (1x10cm). Para highballs y cócteles largos. Se derrite rápidamente.</p>
                                
                                <h4>Hielo Block</h4>
                                <p>Grandes bloques (10x10cm). Se derrite muy lentamente. Para punch bowls y servicio prolongado.</p>
                                
                                <h4>Hielo Clarificado</h4>
                                <p>Hielo cristalino sin impurezas. Para cócteles premium. Elimina sabores indeseados.</p>
                                
                                <h4>Hielo Flavored</h4>
                                <p>Hielo infusionado con sabores. Hierbas, frutas, té. Aporta sutilidad al cóctel.</p>
                                
                                <h4>Dry Ice (Hielo Seco)</h4>
                                <p>Dióxido de carbono sólido. Para efectos visuales. No consumir directamente.</p>
                            `,
                            exercises: `
                                <ol>
                                    <li>Compara velocidad de derretimiento de diferentes tipos</li>
                                    <li>Prepara cóctel con hielo en esfera</li>
                                    <li>Experimenta con hielo flavored</li>
                                    <li>Documenta efectos visuales y sabor</li>
                                </ol>
                            `
                        }
                    ]
                },
                '3.3': {
                    title: 'Garnishes Clásicos',
                    sections: [
                        {
                            icon: '🍊',
                            title: 'Cítricos y Frutas',
                            content: `
                                <h4>Twist de Cáscara</h4>
                                <p>Tira delgada de cáscara de cítrico. Exprime sobre cóctel para aceites esenciales. Clásico para Old Fashioned.</p>
                                
                                <h4>Wheel de Cítrico</h4>
                                <p>Rodaja circular de limón/lima/naranja. Decorativo y funcional. Para gin & tonic, margarita.</p>
                                
                                <h4>Wedge de Lima/Limón</h4>
                                <p>Triángulo de cítrico. Funcional para exprimir y decorar. Para mojito, caipirinha.</p>
                                
                                <h4>Cherry</h4>
                                <p>Cereza marraschino o fresh. Clásico para Manhattan, Old Fashioned.</p>
                                
                                <h4>Olives</h4>
                                <p>Aceitunas verdes o negras. Esencial para Martini, Gibson.</p>
                            `,
                            exercises: `
                                <ol>
                                    <li>Practica diferentes tipos de citrus cuts</li>
                                    <li>Experimenta con orange peel flame</li>
                                    <li>Crea lemon spiral perfecta</li>
                                    <li>Compara visual vs funcional</li>
                                </ol>
                            `
                        }
                    ]
                },
                '3.4': {
                    title: 'Garnishes Avanzados',
                    sections: [
                        {
                            icon: '🎨',
                            title: 'Técnicas Decorativas',
                            content: `
                                <h4>Zest Art</h4>
                                <p>Diseños con ralladura de cítricos. Crear patrones, letras, o formas. Para presentación artística.</p>
                                
                                <h4>Flower Garnishes</h4>
                                <p>Flores comestibles frescas. Violets, roses, hibiscus. Elegantes y coloridos.</p>
                                
                                <h4>Sugar Rim</h4>
                                <p>Borde de azúcar. Clásico para margarita. Puede ser colored o flavored.</p>
                                
                                <h4>Salt Rim</h4>
                                <p>Borde de sal. Para margarita, paloma. Sal marina, smoked salt, etc.</p>
                                
                                <h4>Fruit Skewers</h4>
                                <p>Brochette de frutas. Berries, cítricos, tropical. Visual y funcional.</p>
                                
                                <h4>Dehydrated Garnishes</h4>
                                <p>Frutas deshidratadas. Intensos sabores, larga vida. Citrus wheels, apple chips.</p>
                            `,
                            exercises: `
                                <ol>
                                    <li>Practica zest art techniques</li>
                                    <li>Experimenta con edible flowers</li>
                                    <li>Crea flavored rims</li>
                                    <li>Prepara dehydrated garnishes</li>
                                </ol>
                            `
                        }
                    ]
                },
                '3.5': {
                    title: 'Técnicas de Servicio',
                    sections: [
                        {
                            icon: '🎭',
                            title: 'Protocolo de Servicio',
                            content: `
                                <h4>Order Taking</h4>
                                <ul>
                                    <li>Escuchar activamente preferencias del cliente</li>
                                    <li>Recomendar basado en gustos</li>
                                    <li>Explicar ingredientes y técnicas</li>
                                    <li>Confirmar orden antes de preparar</li>
                                </ul>
                                
                                <h4>Service Flow</h4>
                                <ul>
                                    <li>Preparar cóctel con eficiencia</li>
                                    <li>Presentar con elegancia</li>
                                    <li>Explicar cóctel si es necesario</li>
                                    <li>Verificar satisfacción</li>
                                </ul>
                                
                                <h4>Customer Interaction</h4>
                                <ul>
                                    <li>Mantener contacto visual</li>
                                    <li>Sonreír y ser amigable</li>
                                    <li>Estar disponible para preguntas</li>
                                    <li>Manejar quejas profesionalmente</li>
                                </ul>
                            `,
                            exercises: `
                                <ol>
                                    <li>Practica order taking scenarios</li>
                                    <li>Desarrolla service flow personal</li>
                                    <li>Role-play customer interactions</li>
                                    <li>Crea upselling strategies</li>
                                </ol>
                            `
                        }
                    ]
                },
                '3.6': {
                    title: 'Fotografía de Cócteles',
                    sections: [
                        {
                            icon: '📸',
                            title: 'Fundamentos de Fotografía',
                            content: `
                                <h4>Equipment Básico</h4>
                                <ul>
                                    <li><strong>Cámara:</strong> DSLR, mirrorless, o smartphone high-end</li>
                                    <li><strong>Lente:</strong> 50mm o 85mm para cócteles</li>
                                    <li><strong>Trípode:</strong> Estabilidad y sharpness</li>
                                    <li><strong>Lighting:</strong> Natural o artificial controlada</li>
                                </ul>
                                
                                <h4>Composición Básica</h4>
                                <ul>
                                    <li><strong>Rule of Thirds:</strong> Dividir imagen en 9 secciones</li>
                                    <li><strong>Leading Lines:</strong> Usar elementos para guiar vista</li>
                                    <li><strong>Symmetry:</strong> Balance visual perfecto</li>
                                    <li><strong>Framing:</strong> Usar elementos para enmarcar</li>
                                </ul>
                                
                                <h4>Angles y Perspectivas</h4>
                                <ul>
                                    <li><strong>Eye Level:</strong> Vista natural y directa</li>
                                    <li><strong>Top Down:</strong> Vista desde arriba (flat lay)</li>
                                    <li><strong>45° Angle:</strong> Ángulo clásico de producto</li>
                                    <li><strong>Low Angle:</strong> Vista dramática desde abajo</li>
                                </ul>
                            `,
                            exercises: `
                                <ol>
                                    <li>Practica diferentes composiciones</li>
                                    <li>Experimenta con ángulos variados</li>
                                    <li>Prueba diferentes configuraciones de cámara</li>
                                    <li>Compara resultados profesionales</li>
                                </ol>
                            `
                        }
                    ]
                }
            }
        };
        
        return courseContent[courseId]?.[moduleNumber] || {
            title: 'Módulo en Desarrollo',
            sections: [
                {
                    icon: '📝',
                    title: 'Contenido Próximamente',
                    content: '<p>Este módulo está siendo desarrollado con contenido detallado.</p>'
                }
            ]
        };
    }

    completeSection(courseId, moduleNumber, sectionIndex) {
        if (!this.app.courseProgress[courseId]) {
            this.app.courseProgress[courseId] = {
                started: true,
                completed: false,
                currentModule: moduleNumber,
                completedModules: [],
                completedSections: {},
                startDate: new Date().toISOString(),
                progress: 0
            };
        }
        
        if (!this.app.courseProgress[courseId].completedSections[moduleNumber]) {
            this.app.courseProgress[courseId].completedSections[moduleNumber] = [];
        }
        
        if (!this.app.courseProgress[courseId].completedSections[moduleNumber].includes(sectionIndex)) {
            this.app.courseProgress[courseId].completedSections[moduleNumber].push(sectionIndex);
            this.saveCourseProgress();
            this.updateModuleViewer(courseId, moduleNumber);
        }
    }

    isSectionCompleted(courseId, moduleNumber, sectionIndex) {
        return this.app.courseProgress[courseId]?.completedSections?.[moduleNumber]?.includes(sectionIndex) || false;
    }

    getCompletedSections(courseId, moduleNumber) {
        const moduleContent = this.getModuleContent(courseId, moduleNumber);
        const completed = this.app.courseProgress[courseId]?.completedSections?.[moduleNumber] || [];
        return completed.length;
    }

    getModuleProgress(courseId, moduleNumber) {
        const moduleContent = this.getModuleContent(courseId, moduleNumber);
        const completed = this.getCompletedSections(courseId, moduleNumber);
        return Math.round((completed / moduleContent.sections.length) * 100);
    }

    updateModuleViewer(courseId, moduleNumber) {
        const viewer = document.querySelector('.module-viewer');
        if (viewer) {
            const progress = this.getModuleProgress(courseId, moduleNumber);
            const progressBar = viewer.querySelector('.progress-fill-small');
            const progressText = viewer.querySelector('.progress-text-small');
            
            if (progressBar) progressBar.style.width = `${progress}%`;
            if (progressText) progressText.textContent = `${progress}% completado`;
            
            // Update section status
            const sections = viewer.querySelectorAll('.progress-section');
            sections.forEach((section, index) => {
                const status = section.querySelector('.section-status');
                if (this.isSectionCompleted(courseId, moduleNumber, index)) {
                    section.classList.add('completed');
                    if (status) status.textContent = '✅';
                }
            });
            
            // Update lesson sections
            const lessonSections = viewer.querySelectorAll('.lesson-section');
            lessonSections.forEach((section, index) => {
                if (this.isSectionCompleted(courseId, moduleNumber, index)) {
                    section.classList.add('completed');
                    const btn = section.querySelector('.btn-complete-section');
                    if (btn) btn.textContent = '✅ Completado';
                }
            });
            
            // Update navigation buttons
            const nextBtn = viewer.querySelector('.btn-primary');
            const moduleContent = this.getModuleContent(courseId, moduleNumber);
            if (nextBtn && this.getCompletedSections(courseId, moduleNumber) === moduleContent.sections.length) {
                nextBtn.disabled = false;
            }
        }
    }

    nextModule(courseId, currentModule) {
        const course = this.courses[courseId];
        const progress = this.app.courseProgress[courseId];
        
        if (!progress.completedModules.includes(currentModule)) {
            progress.completedModules.push(currentModule);
        }
        
        if (currentModule === course.modules) {
            progress.completed = true;
            progress.endDate = new Date().toISOString();
            progress.progress = 100;
            this.saveCourseProgress();
            this.showCourseCompletion(courseId);
        } else {
            progress.currentModule = currentModule + 1;
            progress.progress = Math.round((progress.completedModules.length / course.modules) * 100);
            this.saveCourseProgress();
            
            document.querySelector('.module-viewer').remove();
            this.showModuleContent(courseId, currentModule + 1);
        }
        
        this.updateCourseUI();
    }

    previousModule(courseId, currentModule) {
        if (currentModule > 1) {
            document.querySelector('.module-viewer').remove();
            this.showModuleContent(courseId, currentModule - 1);
        }
    }

    closeModuleViewer() {
        document.querySelector('.module-viewer')?.remove();
    }

    showCourseCompletion(courseId) {
        const course = this.courses[courseId];
        const progress = this.app.courseProgress[courseId];
        
        document.querySelector('.module-viewer')?.remove();
        
        const modal = document.createElement('div');
        modal.className = 'course-modal';
        modal.innerHTML = `
            <div class="course-modal-content completion">
                <div class="completion-icon">🎉</div>
                <h3>¡Felicidades!</h3>
                <p>Has completado el curso "${course.title}"</p>
                <div class="completion-stats">
                    <span><i class="fa-solid fa-calendar"></i> Inicio: ${new Date(progress.startDate).toLocaleDateString()}</span>
                    <span><i class="fa-solid fa-calendar-check"></i> Fin: ${new Date(progress.endDate).toLocaleDateString()}</span>
                </div>
                <div class="resources-section">
                    <h4>Recursos Adicionales</h4>
                    <div class="resources-grid">
                        <a href="#recetas" class="resource-link" onclick="app.goTo('recetas'); this.closest('.course-modal').remove()">
                            <i class="fa-solid fa-cocktail"></i>
                            <span>Explorar Recetas</span>
                        </a>
                        <a href="#historia" class="resource-link" onclick="app.goTo('historia'); this.closest('.course-modal').remove()">
                            <i class="fa-solid fa-history"></i>
                            <span>Historia del Alcohol</span>
                        </a>
                        <a href="#acerca" class="resource-link" onclick="app.goTo('acerca'); this.closest('.course-modal').remove()">
                            <i class="fa-solid fa-info-circle"></i>
                            <span>Más sobre BARMASTER</span>
                        </a>
                    </div>
                </div>
                <div class="completion-actions">
                    <button class="btn-primary" onclick="courseManager.exploreMore('${courseId}')">
                        <i class="fa-solid fa-compass"></i> Explorar Más
                    </button>
                    <button class="btn-secondary" onclick="this.closest('.course-modal').remove()">
                        Cerrar
                    </button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
    }

    exploreMore(courseId) {
        document.querySelector('.course-modal')?.remove();
        // Redirigir a recetas para continuar aprendiendo
        app.goTo('recetas');
    }

    updateCourseUI() {
        Object.keys(this.courses).forEach(courseId => {
            const card = document.querySelector(`[data-course="${courseId}"]`);
            const progress = this.app.courseProgress[courseId];
            
            if (card && progress) {
                let progressIndicator = card.querySelector('.progress-indicator');
                if (!progressIndicator) {
                    progressIndicator = document.createElement('div');
                    progressIndicator.className = 'progress-indicator';
                    card.querySelector('.course-header').appendChild(progressIndicator);
                }
                
                progressIndicator.innerHTML = `
                    <div class="progress-bar-small">
                        <div class="progress-fill-small" style="width: ${progress.progress}%"></div>
                    </div>
                    <span class="progress-text-small">${progress.progress}%</span>
                `;
                
                const btn = card.querySelector('.course-btn');
                if (btn) {
                    if (progress.completed) {
                        btn.innerHTML = '<i class="fa-solid fa-check"></i> Curso Completado';
                        btn.disabled = true;
                    } else if (progress.started) {
                        btn.innerHTML = '<i class="fa-solid fa-play"></i> Continuar Curso';
                    }
                }
            }
        });
    }

    openModule(courseId, moduleNumber) {
        // Iniciar el curso si no está iniciado
        if (!this.app.courseProgress[courseId]) {
            this.startCourse(courseId);
        }
        
        // Mostrar el contenido del módulo específico
        this.showModuleContent(courseId, moduleNumber);
    }

    bindCourseEvents() {
        document.addEventListener('click', (e) => {
            if (e.target.matches('.course-btn')) {
                const courseCard = e.target.closest('.course-card');
                const courseId = courseCard.dataset.course;
                this.startCourse(courseId);
            }
        });
    }
}

// Initialize course manager
let courseManager;

function initCourseManager() {
    courseManager = new CourseManager(app);
    console.log('CourseManager initialized:', courseManager);
}

// Asistente Simple y Útil
let assistantOpen = false;

// Initialize course manager when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, initializing components...');
    initCourseManager();
    console.log('All components initialized');
});

const simpleRecipes = {
    'martini': {
        name: 'Martini Clásico',
        ingredients: ['2.5oz Gin', '0.5oz Vermouth seco', 'Hielo', 'Aceituna'],
        steps: ['Enfría copa con hielo', 'Mezcla gin y vermouth', 'Revelve 30 segundos', 'Cuela en copa fría', 'Decora con aceituna']
    },
    'mojito': {
        name: 'Mojito',
        ingredients: ['2oz Ron blanco', '1oz Jugo de lima', '2 cucharadas azúcar', '8 hojas menta', 'Soda'],
        steps: ['Muddle menta con azúcar y lima', 'Añade ron y hielo', 'Completa con soda', 'Revelve suavemente', 'Decora con menta']
    },
    'margarita': {
        name: 'Margarita',
        ingredients: ['2oz Tequila', '1oz Cointreau', '1oz Jugo de lima', 'Sal para el borde'],
        steps: ['Bordea copa con sal', 'Agrega ingredientes al shaker', 'Agita vigorosamente', 'Cuela en copa', 'Decora con lima']
    },
    'whisky': {
        name: 'Whisky Old Fashioned',
        ingredients: ['2oz Whisky bourbon', '1 terrón azúcar', '2 dashes Angostura', 'Hielo'],
        steps: ['Muddle azúcar con bitters', 'Añade whisky y hielo', 'Revelve suavemente', 'Decora con naranja', 'Sirve en rocks glass']
    }
};

function toggleAssistant() {
    console.log('toggleAssistant called');
    const assistant = document.getElementById('assistantWindow');
    
    if (!assistant) {
        console.error('Assistant window not found');
        return;
    }
    
    assistantOpen = !assistantOpen;
    console.log('Toggling assistant, new state:', assistantOpen);
            
    if (assistantOpen) {
        assistant.classList.add('open');
        console.log('Assistant opened');
    } else {
        assistant.classList.remove('open');
        console.log('Assistant closed');
    }
}

function closeAssistant() {
    console.log('closeAssistant called');
    const assistant = document.getElementById('assistantWindow');
    
    if (!assistant) {
        console.error('Assistant window not found');
        return;
    }
    
    assistantOpen = false;
    assistant.classList.remove('open');
    console.log('Assistant closed');
}

function showRecipe(cocktail) {
    console.log('showRecipe called with cocktail:', cocktail);
    const display = document.getElementById('recipeDisplay');
    const recipe = simpleRecipes[cocktail];
    
    if (!display) {
        console.error('Recipe display element not found');
        return;
    }
    
    if (recipe) {
        console.log('Displaying recipe:', recipe.name);
        display.innerHTML = `
            <h5>${recipe.name}</h5>
            <strong>Ingredientes:</strong>
            <ul>
                ${recipe.ingredients.map(ing => `<li>${ing}</li>`).join('')}
            </ul>
            <strong>Pasos:</strong>
            <ol>
                ${recipe.steps.map((step, i) => `<li>${step}</li>`).join('')}
            </ol>
        `;
        console.log('Recipe displayed successfully');
    } else {
        console.error('Recipe not found for cocktail:', cocktail);
        display.innerHTML = '<p>Receta no encontrada</p>';
    }
}

// Cookie banner is handled by inline script in index.html

