import React, { Component, PropTypes } from "react";

import Icon from "metabase/components/Icon.jsx";

import cx from "classnames";

export default class CardFavoriteButton extends Component {
    constructor(props, context) {
        super(props, context);
        this.toggleFavorite = this.toggleFavorite.bind(this);

        this.state = {
            favorite: false
        };
    }

    static propTypes = {
        cardApi: PropTypes.func.isRequired,
        cardId: PropTypes.number.isRequired
    };

    componentDidMount() {
        this.loadFavoriteStatus();
    }

    componentWillReceiveProps(newProps) {
        this.loadFavoriteStatus();
    }

    loadFavoriteStatus() {
        var component = this;

        // initialize the current favorite status
        this.props.cardApi.isfavorite({
            'cardId': component.props.cardId
        }, function(result) {
            var fav = false;
            if (result.favorite === true) {
                fav = true;
            }

            component.setState({
                favorite: fav
            });
        }, function(error) {
            console.log(error);
        });
    }

    toggleFavorite() {

        var component = this;
        if (this.state.favorite) {
            // already favorited, lets unfavorite
            this.props.cardApi.unfavorite({
                'cardId': component.props.cardId
            }, function(result) {
                component.setState({
                    favorite: false
                });
            }, function(error) {
                console.log(error);
            });
        } else {
            // currently not favorited, lets favorite
            this.props.cardApi.favorite({
                'cardId': component.props.cardId
            }, function(result) {
                component.setState({
                    favorite: true
                });
            }, function(error) {
                console.log(error);
            });
        }
    }

    render() {
        var iconClasses = cx({
            'mx1': true,
            'transition-color': true,
            'text-grey-4': !this.state.favorite,
            'text-brand-hover': !this.state.favorite,
            'text-gold': this.state.favorite
        });

        return (
            <a className={iconClasses} onClick={this.toggleFavorite} title="Favorite this question">
                <Icon name="star" width="16px" height="16px"></Icon>
            </a>
        );
    }
}
