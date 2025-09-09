// Shims for legacy libs expecting Node/UMD-style globals
if (typeof globalThis === "undefined") window.globalThis = window;
if (typeof global === "undefined") window.global = window;
