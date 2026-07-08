import cx from "classnames";
import type { HTMLAttributes, LabelHTMLAttributes } from "react";

import S from "./DatabaseFeatureComponents.module.css";

export const Label: React.FC<LabelHTMLAttributes<HTMLLabelElement>> = (
  props,
) => <label {...props} className={cx(S.label, props.className)} />;

export const Description: React.FC<HTMLAttributes<HTMLParagraphElement>> = (
  props,
) => <p {...props} className={cx(S.description, props.className)} />;

export const Error: React.FC<HTMLAttributes<HTMLParagraphElement>> = (
  props,
) => <p {...props} className={cx(S.error, props.className)} />;
