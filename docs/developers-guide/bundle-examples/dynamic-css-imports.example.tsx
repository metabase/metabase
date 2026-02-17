/**
 * Example: Dynamic CSS Imports
 * 
 * This example shows how to load CSS only when a component is used,
 * rather than loading all CSS upfront.
 * 
 * BEFORE: All CSS loaded in main bundle
 * AFTER: CSS loaded only when component is rendered
 */

import { lazy, Suspense } from "react";

// ❌ BAD: Loading CSS globally adds to initial bundle
// import "leaflet/dist/leaflet.css";
// import "./MapComponent.css";

// ✅ GOOD: Create a wrapper that loads CSS dynamically
const MapComponentWithStyles = lazy(async () => {
  // Import CSS dynamically
  await import("leaflet/dist/leaflet.css");
  await import("./MapComponent.css");
  
  // Then import the component
  return import("./MapComponent");
});

interface MapProps {
  center: [number, number];
  zoom: number;
  markers?: Array<{ lat: number; lng: number; label: string }>;
}

export function Map(props: MapProps) {
  return (
    <Suspense fallback={<div>Loading map...</div>}>
      <MapComponentWithStyles {...props} />
    </Suspense>
  );
}

/**
 * Alternative approach: Load CSS in the component itself
 */
export const MapWithInlineStyles = lazy(async () => {
  // This runs only once when the component is first loaded
  const [_, component] = await Promise.all([
    import("leaflet/dist/leaflet.css"),
    import("./MapComponent"),
  ]);
  
  return component;
});

/**
 * Usage:
 * 
 * import { Map } from "./DynamicMap";
 * 
 * function LocationPage() {
 *   return (
 *     <div>
 *       <h1>Location</h1>
 *       <Map center={[51.505, -0.09]} zoom={13} />
 *     </div>
 *   );
 * }
 */

/**
 * Benefits:
 * 
 * 1. CSS is not in the main bundle
 * 2. CSS loads only when map is actually rendered
 * 3. Reduces initial page load time
 * 4. Better for pages that don't use maps
 * 5. CSS is cached after first load
 */

/**
 * For Mantine components:
 * Mantine v8 handles CSS automatically per component,
 * but you can still optimize by lazy loading entire sections:
 */

const AdminPanel = lazy(async () => {
  // Load admin-specific CSS
  await import("./admin/styles.css");
  return import("./admin/AdminPanel");
});

export function AdminRoute() {
  return (
    <Suspense fallback={<div>Loading admin panel...</div>}>
      <AdminPanel />
    </Suspense>
  );
}
