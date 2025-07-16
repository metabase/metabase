# iOS Performance Fixes for Embedded Dashboards

## Issue
Embedded Metabase dashboards were experiencing performance issues and freezing on iOS devices (Safari and Chrome) after upgrading to version 0.55.6.2. The issue was particularly noticeable with:

- Dashboard tabs switching causing high GPU usage
- Animated charts causing browser crashes
- Interactive elements becoming unresponsive
- Console errors related to Mantine's useMediaQuery

## Root Cause
The performance issues were caused by:

1. **ECharts animations** triggering excessive GPU acceleration on iOS
2. **CSS `will-change: transform`** properties causing GPU layer creation
3. **Complex drag-and-drop operations** in dashboard tabs overwhelming iOS browsers
4. **Frequent media query evaluations** during interactions

## Solution
We implemented iOS-specific performance optimizations:

### 1. Chart Animation Optimization
- **File**: `frontend/src/metabase/visualizations/echarts/cartesian/option/index.ts`
- **Change**: Disabled animations on iOS devices
- **Impact**: Prevents GPU performance issues while maintaining functionality

### 2. CSS Performance Fix
- **File**: `frontend/src/metabase/visualizations/components/FunnelNormal.styled.tsx`
- **Change**: Conditionally applied `will-change` property (disabled on iOS)
- **Impact**: Reduces GPU layer creation on touch devices

### 3. Dashboard Tabs Optimization
- **File**: `frontend/src/metabase/dashboard/components/DashboardTabs/DashboardTabs.tsx`
- **Change**: Disabled drag-and-drop on iOS devices
- **Impact**: Reduces complex DOM manipulations during tab interactions

### 4. Utility Functions
- **File**: `frontend/src/metabase/lib/ios-detection.ts`
- **Purpose**: Centralized iOS detection and optimization utilities
- **Functions**:
  - `isIOSDevice()`: Detects iOS devices
  - `getIOSOptimizedAnimationSettings()`: Returns animation settings optimized for iOS
  - `getIOSOptimizedDebounceDelay()`: Increases debounce delays on iOS
  - `shouldDisableDragOnIOS()`: Determines if drag operations should be disabled

## Implementation Details

### iOS Detection
```typescript
export function isIOSDevice(): boolean {
  if (typeof navigator === 'undefined') {
    return false;
  }
  
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}
```

### Chart Animation Optimization
```typescript
export const getSharedEChartsOptions = (isAnimated: boolean) => {
  const animationSettings = getIOSOptimizedAnimationSettings(isAnimated);

  return {
    useUTC: true,
    animation: animationSettings.animated,
    animationDuration: animationSettings.duration ?? 0,
    animationDurationUpdate: animationSettings.animationDurationUpdate,
    // ... other options
  };
};
```

### CSS Performance
```css
/* Disable will-change on iOS to prevent GPU performance issues */
@media not all and (hover: none) and (pointer: coarse) {
  will-change: transform;
}
```

## Testing
To test these fixes:

1. **iOS Safari**: Open embedded dashboard on iPhone/iPad Safari
2. **iOS Chrome**: Test on Chrome for iOS
3. **Animation Test**: Verify charts load without freezing
4. **Tab Switching**: Confirm smooth tab transitions
5. **Touch Interactions**: Ensure responsive touch interactions

## Monitoring
Watch for:
- Reduced crash reports on iOS devices
- Improved performance metrics for mobile users
- Stable dashboard interactions
- No regression in visual quality

## Future Improvements
Consider implementing:
- Progressive enhancement for iOS capabilities
- Reduced motion preferences detection
- Memory usage monitoring for mobile devices
- Adaptive rendering based on device performance