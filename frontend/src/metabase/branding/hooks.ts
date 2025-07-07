import { useEffect, useState } from "react";

interface BrandingConfig {
  enabled: boolean;
  logo_url?: string;
  favicon_url?: string;
  brand_name: string;
  primary_color: string;
}

const defaultBranding: BrandingConfig = {
  enabled: false,
  brand_name: "Metabase",
  primary_color: "#509EE3",
};

export const useBranding = () => {
  const [branding, setBranding] = useState<BrandingConfig>(defaultBranding);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadBranding = async () => {
      try {
        const response = await fetch("/api/branding");
        if (response.ok) {
          const data = await response.json();
          setBranding(data);
        }
      } catch (error) {
        console.warn("Failed to load branding configuration:", error);
      } finally {
        setLoading(false);
      }
    };

    loadBranding();
  }, []);

  return { branding, loading };
};

export const applyBranding = (branding: BrandingConfig) => {
  if (!branding.enabled) return;

  // Update document title
  if (branding.brand_name) {
    document.title = branding.brand_name;
  }

  // Update favicon
  if (branding.favicon_url) {
    let favicon = document.querySelector('link[rel="icon"]') as HTMLLinkElement;
    if (!favicon) {
      favicon = document.createElement("link");
      favicon.rel = "icon";
      document.head.appendChild(favicon);
    }
    favicon.href = branding.favicon_url;
  }

  // Update CSS custom properties for theming
  if (branding.primary_color) {
    document.documentElement.style.setProperty(
      "--mb-color-brand",
      branding.primary_color
    );
  }

  // Set global branding object for components to use
  (window as any).METABASE_BRANDING = branding;
};