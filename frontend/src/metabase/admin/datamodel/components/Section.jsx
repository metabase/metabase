import React from "react";

import cx from "classnames";

const Section = ({ children, first, last }) => (
  <section
    className={cx("pb4", first ? "mb4" : "my4", { "border-bottom": !last })}
  >
    {children}
  </section>
);

export const SectionHeader = ({ title, description }) => (
  <div className="mb2">
    <h4>{title}</h4>
    {description && <p className="mb0 text-medium mt1">{description}</p>}
  </div>
);

export default Section;
