/* eslint "react/prop-types": "warn" */

import React, { Component } from "react";
import PropTypes from "prop-types";
import ReactDOM from "react-dom";

import cx from "classnames";
import { Motion, spring } from "react-motion";

import Icon from "metabase/components/Icon";

const KEYCODE_FORWARD_SLASH = 191; // focus search
const KEYCODE_ESCAPE = 27; // blur search
const KEYCODE_ENTER = 13; // execute search

export default class ExpandingSearchField extends Component {
    constructor (props, context) {
        super(props, context);
        this.state = {
            active: false
        };
    }

    static propTypes = {
        onSearch: PropTypes.func.isRequired,
        className: PropTypes.string,
        defaultValue: PropTypes.string,
    }

    componentDidMount () {
        this.listenToSearchKeyDown();
    }

    componentWillUnMount () {
        this.stopListenToSearchKeyDown();
    }

    handleSearchKeydown = (e) => {
        if (!this.state.active && e.keyCode === KEYCODE_FORWARD_SLASH) {
            this.setActive();
            e.preventDefault();
        }
    }

    onKeyPress = (e) => {
        if (e.keyCode === KEYCODE_ENTER) {
            this.props.onSearch(e.target.value)
        } else if (e.keyCode === KEYCODE_ESCAPE) {
            this.setInactive();
        }
    }

    setActive = () => {
        ReactDOM.findDOMNode(this.searchInput).focus();
    }

    setInactive = () => {
        ReactDOM.findDOMNode(this.searchInput).blur();
    }

    listenToSearchKeyDown () {
        window.addEventListener('keydown', this.handleSearchKeydown);
    }

    stopListenToSearchKeyDown() {
        window.removeEventListener('keydown', this.handleSearchKeydown);
    }

    render () {
        const { className } = this.props;
        const { active } = this.state;
        return (
            <div
                className={cx(
                    className,
                    'bordered border-dark flex align-center pr2 transition-border',
                    { 'border-brand' : active }
                )}
                onClick={this.setActive}
                style={{borderRadius: 99}}
            >
                <Icon
                    className={cx('ml2', { 'text-brand': active })}
                    name="search"
                />
                <Motion
                    style={{width: active ? spring(400) : spring(200) }}
                >
                    { interpolatingStyle =>
                        <input
                            ref={(search) => this.searchInput = search}
                            className="input text-bold borderless"
                            placeholder="Search for a question..."
                            style={Object.assign({}, interpolatingStyle, { fontSize: '1em'})}
                            onFocus={() => this.setState({ active: true })}
                            onBlur={() => this.setState({ active: false })}
                            onKeyUp={this.onKeyPress}
                            defaultValue={this.props.defaultValue}
                        />
                    }
                </Motion>
            </div>
        );
    }
}
