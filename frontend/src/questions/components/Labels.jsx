import React, { Component, PropTypes } from "react";
import { Link } from "react-router";
import S from "./Labels.css";

import EmojiIcon from "./EmojiIcon.jsx"

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
            <span className={cx(S.label, S.emojiLabel)}>
                <EmojiIcon name={icon} className={S.emojiIcon} />
                <span>{name}</span>
            </span>
        : icon.charAt(0) === "#" ?
            <span
              className={S.label}
              style={{
                backgroundColor: icon,
                boxShadow: `1px 1px 0 ${icon}`
              }}
            >
              {name}
            </span>
        :
            <span className={S.label}>{name}</span>
        }
    </Link>

export default Labels;
