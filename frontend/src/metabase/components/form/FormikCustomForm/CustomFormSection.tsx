import type * as React from "react";

import DisclosureTriangle from "metabase/components/DisclosureTriangle";

import { useToggle } from "metabase/hooks/use-toggle";
import { CollapsibleSectionContent } from "./CustomFormSection.styled";

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
      <CollapsibleSectionContent onClick={handleToggle}>
        <DisclosureTriangle className="mr1" open={isExpanded} />
        <h3>{title}</h3>
      </CollapsibleSectionContent>
      <div className={isExpanded ? undefined : "hide"}>{children}</div>
    </section>
  );
}

interface CustomFormSectionProps extends SectionProps {
  collapsible?: boolean;
}

/**
 * @deprecated
 */
function CustomFormSection({ collapsible, ...props }: CustomFormSectionProps) {
  const Section = collapsible ? CollapsibleSection : StandardSection;
  return <Section {...props} />;
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default CustomFormSection;
