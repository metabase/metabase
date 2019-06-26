import React from "react";

import Button from "metabase/components/Button";
import Link from "metabase/components/Link";

const AdminPaneTitle = ({
  title,
  description,
  buttonText,
  buttonAction,
  buttonDisabled,
  buttonLink,
}) => (
  <section className="clearfix px2">
    {buttonText && buttonLink && (
      <Link to={buttonLink} className="inline-block float-right">
        <Button primary>{buttonText}</Button>
      </Link>
    )}
    {buttonText && buttonAction && (
      <Button
        className="float-right"
        primary={!buttonDisabled}
        disabled={buttonDisabled}
        onClick={buttonAction}
      >
        {buttonText}
      </Button>
    )}
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
  buttonLink,
}) => (
  <div className="wrapper">
    <AdminPaneTitle
      title={title}
      description={description}
      buttonText={buttonText}
      buttonAction={buttonAction}
      buttonDisabled={buttonDisabled}
      buttonLink={buttonLink}
    />
    {children}
  </div>
);

export default AdminPaneLayout;
