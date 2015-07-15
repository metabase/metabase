'use strict';

import Icon from './icon.react';

var cx = React.addons.classSet;

export default React.createClass({
    displayName: 'CardFavoriteButton',
    propTypes: {
        cardApi: React.PropTypes.func.isRequired,
        cardId: React.PropTypes.number.isRequired
    },

    getInitialState: function() {
        return {
            favorite: false
        };
    },

    componentDidMount: function() {
        this.loadFavoriteStatus();
    },

    componentWillReceiveProps: function(newProps) {
        this.loadFavoriteStatus();
    },

    loadFavoriteStatus: function() {
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
    },

    toggleFavorite: function() {

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
    },

    render: function() {
        var iconClasses = cx({
            'mx1': true,
            'transition-color': true,
            'text-grey-4': !this.state.favorite,
            'text-brand-hover': !this.state.favorite,
            'text-gold': this.state.favorite
        });

        return (
            <a className={iconClasses} href="#" onClick={this.toggleFavorite}>
                <Icon name="star" width="16px" height="16px"></Icon>
            </a>
        );
    }
});
