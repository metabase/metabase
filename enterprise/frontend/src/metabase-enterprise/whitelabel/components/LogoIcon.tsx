import cx from "classnames";
import { type CSSProperties, useEffect, useRef } from "react";

import CS from "metabase/css/core/index.css";
import { useSelector } from "metabase/redux";
import { parseDataUri } from "metabase/utils/data-url";
import {
  getIsDefaultMetabaseLogo,
  getLogoUrl,
} from "metabase-enterprise/settings/selectors";

const DEFAULT_HEIGHT = 32;

type LogoIconProps = {
  width?: number;
  height?: number;
  size?: number;
  dark?: boolean;
  className?: string;
  style?: CSSProperties;
};

export function LogoIcon({
  dark,
  className,
  style = {},
  width,
  height = DEFAULT_HEIGHT,
  size,
}: LogoIconProps) {
  const url = useSelector(getLogoUrl);
  const isDefaultMetabaseLogo = useSelector(getIsDefaultMetabaseLogo);
  const containerRef = useRef<HTMLSpanElement>(null);

  // Keep the latest sizing available to the load effect without making it a
  // dependency, so the image only reloads when the URL changes.
  const sizingRef = useRef({ width, height, size });
  sizingRef.current = { width, height, size };

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !url) {
      return;
    }

    const controller = new AbortController();

    const applySize = (element: SVGSVGElement | HTMLImageElement) => {
      const { width, height, size } = sizingRef.current;
      const resolvedWidth = width || size;
      const resolvedHeight = height || size;
      if (resolvedWidth) {
        element.setAttribute("width", String(resolvedWidth));
      } else {
        element.removeAttribute("width");
      }
      if (resolvedHeight) {
        element.setAttribute("height", String(resolvedHeight));
      } else {
        element.removeAttribute("height");
      }
      element.style.maxWidth = "100%";
      element.style.maxHeight = "32px";
      element.style.minHeight = "100%";
      element.style.height = "auto";
    };

    const renderImgFallback = () => {
      container.replaceChildren();
      const img = document.createElement("img");
      img.src = url;
      applySize(img);
      container.appendChild(img);
    };

    const loadImage = async () => {
      container.replaceChildren();

      const parsed = parseDataUri(url);
      if (parsed) {
        if (parsed.mimeType === "image/svg+xml") {
          container.innerHTML = parsed.data;
          const svg = container.getElementsByTagName("svg")[0];
          if (svg) {
            svg.setAttribute("fill", "currentcolor");
            applySize(svg);
          } else {
            renderImgFallback();
          }
        } else {
          renderImgFallback();
        }
        return;
      }

      try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) {
          renderImgFallback();
          return;
        }

        const text = await response.text();
        const doc = new DOMParser().parseFromString(text, "image/svg+xml");
        const svg = doc.getElementsByTagName("svg")[0];

        if (svg) {
          svg.setAttribute("fill", "currentcolor");
          applySize(svg);
          container.replaceChildren();
          container.appendChild(svg);
        } else {
          renderImgFallback();
        }
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          renderImgFallback();
        }
      }
    };

    loadImage();

    return () => controller.abort();
  }, [url]);

  return (
    <span
      ref={containerRef}
      className={cx(
        "Icon",
        CS.textCentered,
        // If using the Metabase logo, use the non-whitelabeled Metabase brand color.
        {
          [isDefaultMetabaseLogo ? CS.textMetabaseBrand : CS.textBrand]: !dark,
        },
        { [CS.textWhite]: dark },
        className,
      )}
      style={{
        ...style,
        height: style.height || height || "32px",
      }}
      data-testid="main-logo"
    />
  );
}
