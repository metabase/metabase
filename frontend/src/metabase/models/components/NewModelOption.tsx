import cx from "classnames";
import { Link, type LinkProps } from "react-router";

import CS from "metabase/css/core/index.css";

import S from "./NewModelOption.module.css";

type NewModelOptionProps = LinkProps & {
  image: string;
  title: string;
  description: string;
  width?: number;
};

export function NewModelOption({
  width,
  image,
  title,
  description,
  ...props
}: NewModelOptionProps) {
  return (
    <Link {...props} className={S.linkWrapper}>
      <div
        className={cx(CS.flex, CS.alignCenter, CS.layoutCentered)}
        style={{ height: "160px" }}
      >
        <img
          src={`${image}.png`}
          style={{ width: width ? `${width}px` : "210px" }}
          srcSet={`${image}@2x.png 2x`}
        />
      </div>
      <div
        className={cx(CS.textNormal, CS.mt2, CS.mb2, CS.textParagraph)}
        style={{ lineHeight: "1.25em" }}
      >
        <h2 className={S.modelTitle}>{title}</h2>
        <p
          className={cx(CS.textMedium, CS.textSmall)}
          style={{ maxWidth: "360px" }}
        >
          {description}
        </p>
      </div>
    </Link>
  );
}
