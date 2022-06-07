import React from "react";

import DisclosureTriangle from "metabase/components/DisclosureTriangle";

import { useToggle } from "metabase/hooks/use-toggle";

interface SectionProps {
  title?: string;
  children: React.ReactNode;
}

function StandardSection({ title, children }: SectionProps) {
  return (
    <section className="mb4">
      {title && <h2 className="mb2">{title}</h2>}
      {children}
    </section>
  );
}

function CollapsibleSection({ title, children }: SectionProps) {
  const [isExpanded, { toggle: handleToggle }] = useToggle(false);
  return (
    <section className="mb4">
      <div
        className="mb2 flex align-center cursor-pointer text-brand-hover"
        onClick={handleToggle}
      >
        <DisclosureTriangle className="mr1" open={isExpanded} />
        <h3>{title}</h3>
      </div>
      <div className={isExpanded ? undefined : "hide"}>{children}</div>
    </section>
  );
}

interface CustomFormSectionProps extends SectionProps {
  collapsible?: boolean;
}

function CustomFormSection({ collapsible, ...props }: CustomFormSectionProps) {
  const Section = collapsible ? CollapsibleSection : StandardSection;
  return <Section {...props} />;
}

export default CustomFormSection;
