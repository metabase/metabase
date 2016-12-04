import React, { Component } from "react";
import cx from "classnames";
import { Motion, spring } from "react-motion";

import Icon from "metabase/components/Icon";
import Input from "metabase/components/Input";
import OnClickOutsideWrapper from "metabase/components//OnClickOutsideWrapper";

const SEARCH_TRIGGER_KEYCODE = 191;
const SEARCH_ESCAPE_KEYCODE = 27;
const SEARCH_ENTER_KEYCODE = 13;

class Search extends Component {
    constructor () {
        super();
        this.state = { active: false }
        this.handleSearchKeydown = this.handleSearchKeydown.bind(this);
    }

    componentDidMount () {
        this.listenToSearchKeyDown();
    }

    componentWillUnMount () {
        this.stopListenToSearchKeyDown();
    }

    handleSearchKeydown (event) {
        if(this.state.active && event.keyCode === SEARCH_ENTER_KEYCODE) {
            alert('This would search if it worked');
        }

        if(event.keyCode === SEARCH_TRIGGER_KEYCODE) {
            this.setActive();
        } else if (event.keyCode === SEARCH_ESCAPE_KEYCODE) {
            this.setInactive();
        }
    }

    setActive () {
        this.setState({ active: true });
    }

    setInactive() {
        this.setState({ active: false });
    }

    listenToSearchKeyDown () {
        window.addEventListener('keydown', this.handleSearchKeydown);
    }

    stopListenToSearchKeyDown() {
        window.removeEventListener('keydown', this.handleSearchKeydown);
    }

    render () {
        const { active } = this.state;
        return (
            <OnClickOutsideWrapper handleDismissal={this.setInactive.bind(this)}>
                <div
                    className={cx(
                        'bordered border-dark flex align-center pr2 transition-border',
                        { 'border-brand' : active }
                    )}
                    onClick={ () => this.setActive() }
                    style={{
                        borderRadius: 99,
                    }}
                >
                    <Icon
                        className={cx('ml2', { 'text-brand': active })}
                        name="search"
                    />
                    <Motion
                        style={{width: active ? spring(400) : spring(200) }}
                    >
                        { interpolatingStyle =>
                            <Input
                                autofocus={active}
                                className="input text-bold borderless"
                                placeholder="Search for a question..."
                                style={interpolatingStyle}
                            />
                        }
                    </Motion>
                </div>
            </OnClickOutsideWrapper>
        );
    }
}

export default Search;
