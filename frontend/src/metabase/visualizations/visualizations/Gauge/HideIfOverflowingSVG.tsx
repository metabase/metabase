import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

interface Props {
  children: ReactNode;
}

export const HideIfOverflowingSVG = ({ children }: Props) => {
  const elementRef = useRef<SVGGElement>(null);
  const [isHidden, setIsHidden] = useState(false);

  const hideIfClipped = useCallback(() => {
    const element = elementRef.current;

    if (element) {
      let svg: Node | null = element;

      while (svg && svg.nodeName.toLowerCase() !== "svg") {
        svg = svg.parentNode;
      }

      if (svg instanceof SVGElement) {
        const svgRect = svg.getBoundingClientRect();
        const elementRect = element.getBoundingClientRect();

        const shouldBeHidden = !(
          elementRect.left >= svgRect.left &&
          elementRect.right <= svgRect.right &&
          elementRect.top >= svgRect.top &&
          elementRect.bottom <= svgRect.bottom
        );

        setIsHidden(shouldBeHidden);
      }
    }
  }, []);

  useEffect(() => {
    hideIfClipped();
  });

  return (
    <g
      ref={elementRef}
      style={{
        visibility: isHidden ? "hidden" : undefined,
      }}
    >
      {children}
    </g>
  );
};
