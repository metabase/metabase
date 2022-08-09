import React, { ReactNode } from "react";

export interface FormLabelProps {
  title?: string;
  description?: string;
  children?: ReactNode;
}

const FormLabel = ({ title, description, children }: FormLabelProps) => {
  return (
    <div className="mb3">
      <div style={{ maxWidth: "575px" }}>
        {title && (
          <label className="h5 text-bold text-uppercase">{title}</label>
        )}
        {description && <p className="mt1 mb2">{description}</p>}
      </div>
      {children}
    </div>
  );
};

export default FormLabel;
