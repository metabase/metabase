import React from "react";

import cx from "classnames";

const AdminPaneTitle = ({
  title,
  description,
  buttonText,
  buttonAction,
  buttonDisabled,
}) => (
  <section className="clearfix px2">
    {buttonText && buttonAction ? (
      <button
        className={cx("Button float-right", {
          "Button--primary": !buttonDisabled,
        })}
        disabled={buttonDisabled}
        onClick={buttonAction}
      >
        {buttonText}
      </button>
    ) : null}
    <h2 className="PageTitle">{title}</h2>
    {description && <p className="text-measure">{description}</p>}
  </section>
);

const AdminPaneLayout = ({
  title,
  description,
  buttonText,
  buttonAction,
  buttonDisabled,
  children,
}) => (
  <div className="wrapper">
    <AdminPaneTitle
      title={title}
      description={description}
      buttonText={buttonText}
      buttonAction={buttonAction}
      buttonDisabled={buttonDisabled}
    />
    {children}
  </div>
);

export default AdminPaneLayout;
