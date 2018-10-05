import React from "react";

const Section = ({ children }) => (
  <section className="my4 pb4 border-bottom">{children}</section>
);

export const SectionHeader = ({ title, description }) => (
  <div className="mb2">
    <h4>{title}</h4>
    {description && <p className="mb0 text-medium mt1">{description}</p>}
  </div>
);

export default Section;
