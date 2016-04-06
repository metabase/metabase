import React, { Component, PropTypes } from "react";
import S from "./Labels.css";

import cx from "classnames";

const Labels = ({ labels }) =>
    <ul className={S.labels}>
        { labels.map(label =>
            <Label {...label} />
        )}
    </ul>

const Label = ({ name, icon }) =>
    icon.charAt(0) === ":" ?
        <li className={cx(S.label, S.emojiLabel)}>{icon}{name}</li>
    : icon.charAt(0) === "#" ?
        <li className={S.label} style={{ backgroundColor: icon }}>{name}</li>
    :
        <li className={S.label}>{name}</li>

export default Labels;
