import React from "react";

interface FormFieldDecriptionProps {
  className: string;
  description: string;
}

export const FormFieldDecription = ({
  className,
  description,
}: FormFieldDecriptionProps) => {
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
