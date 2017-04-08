import React, { Component } from "react";
import PropTypes from "prop-types";

import _ from "underscore";

const KEYCODE_ENTER = 13;
const KEYCODE_UP    = 38;
const KEYCODE_DOWN  = 40;

const DEFAULT_FILTER_OPTIONS = (value, option) => {
    try {
        return JSON.stringify(option).includes(value);
    } catch (e) {
        return false;
    }
}

const DEFAULT_OPTION_IS_EQUAL = (a, b) => a === b

export default ({ optionFilter = DEFAULT_FILTER_OPTIONS, optionIsEqual = DEFAULT_OPTION_IS_EQUAL }) => (ComposedComponent) => class extends Component {
    static displayName = "Typeahead["+(ComposedComponent.displayName || ComposedComponent.name)+"]";

    constructor(props, context) {
        super(props, context);
        this.state = {
            suggestions: [],
            selectedSuggestion: null
        };
    }

    static propTypes = {
        value: PropTypes.string,
        options: PropTypes.array
    };

    componentDidMount() {
        window.addEventListener("keydown", this.onKeyDown, true);
    }

    componentWillUnmount() {
        window.removeEventListener("keydown", this.onKeyDown, true);
    }

    onKeyDown = (e) => {
        if (e.keyCode === KEYCODE_UP) {
            e.preventDefault();
            this.onPressUp();
        } else if (e.keyCode === KEYCODE_DOWN) {
            e.preventDefault();
            this.onPressDown();
        } else if (e.keyCode === KEYCODE_ENTER) {
            e.preventDefault();
            this.onSuggestionAccepted(this.state.selectedSuggestion);
        }
    }

    componentWillReceiveProps({ options, value }) {
        let filtered = value ? options.filter(optionFilter.bind(null, value)) : [];
        this.setState({
            suggestions: filtered,
            isOpen: filtered.length > 0
        });
    }

    indexOfSelectedSuggestion() {
        return _.findIndex(this.state.suggestions, (suggestion) =>
            optionIsEqual(suggestion, this.state.selectedSuggestion)
        );
    }

    setSelectedIndex(newIndex) {
        let index = Math.max(Math.min(newIndex, this.state.suggestions.length - 1), 0);
        this.setState({
            selectedSuggestion: this.state.suggestions[index]
        });
    }

    onSuggestionAccepted = (suggestion) => {
        this.props.onSuggestionAccepted(suggestion)
    }

    onPressUp = () => {
        const { suggestions, selectedSuggestion } = this.state;
        if (suggestions.length === 0) {
            return;
        } else if (!selectedSuggestion) {
            this.setState({ selectedSuggestion: suggestions[suggestions.length - 1] });
        } else {
            this.setSelectedIndex(this.indexOfSelectedSuggestion() - 1);
        }
    }

    onPressDown = () => {
        const { suggestions, selectedSuggestion } = this.state;
        if (suggestions.length === 0) {
            return;
        } else if (!selectedSuggestion) {
            this.setState({ selectedSuggestion: suggestions[0] });
        } else {
            this.setSelectedIndex(this.indexOfSelectedSuggestion() + 1);
        }
    }

    render() {
        const { suggestions, selectedSuggestion } = this.state;
        if (suggestions.length === 0) {
            return null;
        }
        return (
            <ComposedComponent
                {...this.props}
                suggestions={suggestions}
                selectedSuggestion={selectedSuggestion}
                onSuggestionAccepted={this.onSuggestionAccepted}
            />
        );
    }
}
