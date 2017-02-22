/* @flow */

import React from "react";
import LogoIcon from "metabase/components/LogoIcon";

import cx from "classnames";

type Props = {
    className?: string,
    logoClassName?: string,
    textClassName?: string
}

const LogoBadge = ({ className, logoClassName, textClassName }: Props) =>
    <a href="http://www.metabase.com/" className={cx(className, "h4 flex text-bold align-center text-brand no-decoration")}>
        <LogoIcon size={24} className={cx(logoClassName, "mr1")} />
        <span className={textClassName}>
            <span className="text-grey-3">Powered by</span> <span className="text-brand">Metabase</span>
        </span>
    </a>

export default LogoBadge;
