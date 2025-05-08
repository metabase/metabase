# Issue #53864: Pin Map zooms out when selecting points that cross the 180th meridian

**URL**: https://github.com/metabase/metabase/issues/53864  
**Priority**: P3  
**Type**: Bug  
**Reporter**: JRZMLLR  
**Updated**: April 1, 2025

## Difficulty Score: 5/10

## Issue Description
When using the Pin Map visualization, if a user selects points that span across the 180th meridian (International Date Line) using the "Draw box to filter" feature, the map zooms out to show the entire world instead of zooming in on the selected region. This occurs because the points, though visually close on the map, are actually on opposite sides of the eastern/western hemispheres in terms of longitude coordinates.

## Technical Complexity

### Core Components Involved
1. **Leaflet Map Implementation**
   - `LeafletMap.jsx` - Base map component with filtering functionality
   - `onFilter` method - Handles box selection and filtering
   - Longitude wrapping logic

2. **Map View Management**
   - Bounds calculation for selected points
   - Map zoom and center calculations
   - Handling of coordinates that cross the 180th meridian

### Implementation Analysis
The issue occurs in the `onFilter` method in `LeafletMap.jsx`. When a user draws a box to filter, the following happens:

1. The map calculates the bounds of the selected area
2. It properly handles longitude wrapping for the filter itself (lines 182-186):
```javascript
// Longitudes should be wrapped to the canonical range [-180, 180]. If the delta is >= 360,
// select the full range; otherwise, you wind up selecting only the overlapping portion.
const lngDelta = Math.abs(bounds.getEast() - bounds.getWest());
const west = lngDelta >= 360 ? -180 : bounds.getSouthWest().wrap().lng;
const east = lngDelta >= 360 ? 180 : bounds.getNorthEast().wrap().lng;
```

3. The filter is correctly applied to the query, selecting all points within the bounds

However, the issue is that after creating the filter, the map doesn't adjust its view to focus on the selected points across the date line. Instead, when points are on both sides of the 180th meridian, the map zooms out to show the entire world because the east-west bounds appear to span most of the globe.

The problem is in how the bounds are interpreted for zoom purposes. When points cross the 180th meridian, their longitudes (e.g., 179° and -179°) appear to be very far apart if not properly wrapped, leading to an extremely wide bound that requires zooming out to show.

### Resolution Factors

**Localization Considerations**: None - This is a purely visual/technical issue with no text changes.

**Testing Requirements**: Medium to High - Requires specific test data with points crossing the 180th meridian (like New Zealand examples).

**Fix Complexity**: Medium to High - Requires understanding of map projections and correctly handling the international date line in Leaflet.

## Overall Assessment
This is a moderately complex bug related to map visualization and coordinate systems. The issue is specific to areas around the 180th meridian (mostly Pacific regions like New Zealand, parts of Russia, Pacific islands).

The fix would involve:
1. Modifying how the map view is adjusted after applying a filter
2. Implementing special handling for bounds that cross the 180th meridian
3. Possibly using Leaflet's built-in features for world-wrapping more effectively

Possible approaches include:
1. Detecting when bounds cross the date line and splitting the view/zoom calculation
2. Using a different projection or mapping library that better handles the date line
3. Adding logic to recognize when points are visually close but have very different longitudes due to the date line

This is a more complex fix than average because it involves understanding of map projections and coordinate systems, but it's a well-known issue in mapping applications.

Estimated time to fix: 5-8 hours, including research, implementation, and testing with various data crossing the meridian.