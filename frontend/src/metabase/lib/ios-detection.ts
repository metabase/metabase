/**
 * Utility functions for detecting iOS devices and applying iOS-specific optimizations.
 * This helps prevent performance issues like dashboard freezing on iOS Safari/Chrome.
 */

/**
 * Detects if the current device is running iOS.
 * Returns true for iPhone, iPad, and iPod touch devices.
 */
export function isIOSDevice(): boolean {
  if (typeof navigator === "undefined") {
    return false;
  }

  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

/**
 * Detects if the current browser is Safari on iOS.
 * This can be useful for Safari-specific workarounds.
 */
export function isIOSSafari(): boolean {
  if (!isIOSDevice()) {
    return false;
  }

  const userAgent = navigator.userAgent;
  return /Safari/.test(userAgent) && !/Chrome|CriOS|FxiOS/.test(userAgent);
}

/**
 * Returns optimized animation settings for iOS devices.
 * Disables animations on iOS to prevent GPU performance issues.
 */
export function getIOSOptimizedAnimationSettings(defaultAnimated: boolean) {
  const shouldAnimate = defaultAnimated && !isIOSDevice();

  return {
    animated: shouldAnimate,
    duration: shouldAnimate ? undefined : 0,
    animationDurationUpdate: shouldAnimate ? 1 : 0,
  };
}

/**
 * Returns optimized debounce delay for iOS devices.
 * Uses longer delays on iOS to reduce the frequency of updates.
 */
export function getIOSOptimizedDebounceDelay(defaultDelay: number): number {
  return isIOSDevice() ? Math.max(defaultDelay * 2, 400) : defaultDelay;
}

/**
 * Determines if drag and drop should be disabled on iOS for better performance.
 * iOS devices have performance issues with complex drag operations.
 */
export function shouldDisableDragOnIOS(isEnabled: boolean): boolean {
  return isEnabled && !isIOSDevice();
}
