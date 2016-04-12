import React, { Component, PropTypes } from "react";
import { Link } from "react-router";
import S from "./Labels.css";

import cx from "classnames";

const Labels = ({ labels }) =>
    <ul className={S.list}>
        { labels.map(label =>
            <li className={S.listItem} key={label.id}>
                <Label {...label} />
            </li>
        )}
    </ul>

const Label = ({ name, icon, slug }) =>
    <Link to={"/questions/label/"+slug}>
        { icon.charAt(0) === ":" ?
            <span className={cx(S.label, S.emojiLabel)}>{icon}{name}</span>
        : icon.charAt(0) === "#" ?
            <span className={S.label} style={{ backgroundColor: icon }}>{name}</span>
        :
            <span className={S.label}>{name}</span>
        }
    </Link>

export default Labels;
