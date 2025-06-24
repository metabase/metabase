import type * as React from "react";

import DisclosureTriangle from "metabase/components/DisclosureTriangle";
import CS from "metabase/css/core/index.css";
import { useToggle } from "metabase/hooks/use-toggle";

import { CollapsibleSectionContent } from "./FormSection.styled";

interface SectionProps {
  title?: string;
  children: React.ReactNode;
}

function StandardSection({ title, children, ...props }: SectionProps) {
  return (
    <section className={CS.mb4} {...props}>
      {title && <h2 className={CS.mb2}>{title}</h2>}
      {children}
    </section>
  );
}

function CollapsibleSection({ title, children, ...props }: SectionProps) {
  const [isExpanded, { toggle: handleToggle }] = useToggle(false);
  return (
    <section className={CS.mb4} {...props}>
      <CollapsibleSectionContent onClick={handleToggle}>
        <DisclosureTriangle className={CS.mr1} open={isExpanded} />
        <h3>{title}</h3>
      </CollapsibleSectionContent>
      <div className={isExpanded ? undefined : CS.hide}>{children}</div>
    </section>
  );
}

interface CustomFormSectionProps extends SectionProps {
  collapsible?: boolean;
}

export function FormSection({ collapsible, ...props }: CustomFormSectionProps) {
  const Section = collapsible ? CollapsibleSection : StandardSection;
  return <Section {...props} />;
}
