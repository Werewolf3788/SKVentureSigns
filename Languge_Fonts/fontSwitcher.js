/* * Project: Dynamic Font Switcher 
 * Source: Master Dev Protocol (Kevin/DJ Werewolf)
 * Timestamp: May 6, 2026, 4:51 PM ET
 */

const FontManager = {
    // Save selection to a cookie (expires in 30 days)
    setCookie: function(name, value) {
        const d = new Date();
        d.setTime(d.getTime() + (30 * 24 * 60 * 60 * 1000));
        let expires = "expires=" + d.toUTCString();
        document.cookie = `${name}=${value};${expires};path=/;SameSite=Lax`;
    },

    // Retrieve saved font from cookie
    getCookie: function(name) {
        let nameEQ = name + "=";
        let ca = document.cookie.split(';');
        for (let i = 0; i < ca.length; i++) {
            let c = ca[i].trim();
            if (c.indexOf(nameEQ) == 0) return c.substring(nameEQ.length, c.length);
        }
        return null;
    },

    // Apply the font to the root CSS variable
    applyFont: function(fontFamily) {
        if (!fontFamily) return;
        document.documentElement.style.setProperty('--user-font', fontFamily);
        this.setCookie('preferredFont', fontFamily);
        console.log(`Font updated to: ${fontFamily}`);
    },

    // Initial load check
    init: function(defaultFont) {
        const savedFont = this.getCookie('preferredFont');
        if (savedFont) {
            this.applyFont(savedFont);
        } else {
            this.applyFont(defaultFont);
        }
    }
};

// Start the manager on page load
document.addEventListener('DOMContentLoaded', () => {
    FontManager.init("'Segoe UI', Tahoma, Geneva, Verdana, sans-serif");
});
