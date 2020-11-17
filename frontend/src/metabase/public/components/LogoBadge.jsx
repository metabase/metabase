/* @flow */

import React from "react";
import LogoIcon from "metabase/components/LogoIcon";

import { t, jt } from "ttag";

type Props = {
  dark: boolean,
};

const LogoBadge = ({ dark }: Props) => (
  <a
    href="https://metabase.com/"
    target="_blank"
    className="h4 flex text-bold align-center no-decoration"
  >
    <LogoIcon height={28} dark={dark} />
    <span className="text-small">
      <span className="ml1 md-ml2 text-medium">{jt`Powered by ${(
        <span className={dark ? "text-white" : "text-brand"}>
          {t`Metabase`}
        </span>
      )}`}</span>
    </span>
  </a>
);

export default LogoBadge;
