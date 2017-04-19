/* eslint "react/prop-types": "warn" */
import React, { Component } from "react";
import PropTypes from "prop-types";
import { Link } from "react-router";
import S from "./Labels.css";
import color from 'color'
import * as Urls from "metabase/lib/urls";

import EmojiIcon from "metabase/components/EmojiIcon.jsx"

import cx from "classnames";

const Labels = ({ labels }) =>
    <ul className={S.list}>
        { labels.map(label =>
            <li className={S.listItem} key={label.id}>
                <Label {...label} />
            </li>
        )}
    </ul>

Labels.propTypes = {
    labels:  PropTypes.array.isRequired,
};

class Label extends Component {
  constructor(props) {
    super(props)
    this.state = {
      hovered: false
    }
  }
  render () {
    const { name, icon, slug } = this.props
    const { hovered } = this.state
    return (
      <Link
        to={Urls.label({ slug })}
        onMouseEnter={() => this.setState({ hovered: true })}
        onMouseLeave={() => this.setState({ hovered: false })}
      >
          { icon.charAt(0) === ":" ?
              <span className={cx(S.label, S.emojiLabel)}>
                  <EmojiIcon name={icon} className={S.emojiIcon} />
                  <span>{name}</span>
              </span>
          : icon.charAt(0) === "#" ?
              <span
                className={S.label}
                style={{
                  backgroundColor: hovered ? color(icon).darken(0.1).hex() : icon,
                  boxShadow: `1px 1px 0 ${color(icon).darken(hovered ? 0.1 : 0.2).hex()}`,
                  transition: 'background .3s ease-in-out'
                }}
              >
                {name}
              </span>
          :
              <span className={S.label}>{name}</span>
          }
      </Link>
    )
  }
}

Label.propTypes = {
    name:   PropTypes.string.isRequired,
    icon:   PropTypes.string.isRequired,
    slug:   PropTypes.string.isRequired,
};

export default Labels;
