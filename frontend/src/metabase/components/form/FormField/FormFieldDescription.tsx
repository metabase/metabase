import React from "react";

interface FormFieldDescriptionProps {
  className: string;
  description: string;
}

export const FormFieldDescription = ({
  className,
  description,
}: FormFieldDescriptionProps) => {
  if (typeof description === "string") {
    return (
      <div
        className={className}
        dangerouslySetInnerHTML={{
          __html: description,
        }}
      />
    );
  }
  return <div className={className}>{description}</div>;
};
