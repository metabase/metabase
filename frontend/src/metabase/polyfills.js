/**
 * Manual polyfills for features that babel-plugin-polyfill-corejs3 does not
 * inject (e.g. Set instance methods like isSubsetOf for Chrome < 122).
 * Import this once from the app entry point(s).
 */
import "core-js/stable/set";
