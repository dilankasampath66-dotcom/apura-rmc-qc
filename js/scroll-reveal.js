/**
 * Premium Scroll Reveal Logic using Intersection Observer
 * Attaches to elements with the '.reveal-on-scroll' class.
 */
document.addEventListener('DOMContentLoaded', () => {
    // 1. Select all containers you want to animate
    // We add the reveal class to major layout elements
    const containers = document.querySelectorAll('.card, .panel, .dashboard-container, .glass-card, .kanban-col, .white-box');
    
    containers.forEach(el => {
        el.classList.add('reveal-on-scroll');
    });

    // 2. Setup Intersection Observer
    const observerOptions = {
        root: null,       // use viewport
        rootMargin: '0px',
        threshold: 0.1    // trigger when 10% of element is visible
    };

    const revealCallback = (entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                // Add the class that triggers the CSS animation
                entry.target.classList.add('is-revealed');
                // Unobserve after revealing to prevent repeating animation
                observer.unobserve(entry.target);
            }
        });
    };

    const revealObserver = new IntersectionObserver(revealCallback, observerOptions);

    // 3. Observe each element
    const revealElements = document.querySelectorAll('.reveal-on-scroll');
    revealElements.forEach(el => {
        revealObserver.observe(el);
    });
});
