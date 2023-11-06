import { useLayoutEffect, useMemo, useState } from "react";
import { Popover } from "@mantine/core";
import type { PopoverDropdownProps } from "@mantine/core";

export function PopoverDropdown({ children, ...props }: PopoverDropdownProps) {
  const observer = useMemo(createObserver, []);
  const [target, setTarget] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    if (target) {
      observer.observe(target);
      return () => observer.unobserve(target);
    }
  }, [target, observer]);

  return (
    <Popover.Dropdown {...props}>
      <div ref={setTarget}>{children}</div>
    </Popover.Dropdown>
  );
}

function createObserver() {
  return new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.intersectionRatio < 1 && entry.target.parentElement) {
        entry.target.parentElement.style.maxHeight = `${entry.intersectionRect.height}px`;
      }
    });
  });
}
