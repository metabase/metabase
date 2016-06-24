import React, { Component, PropTypes } from "react";


export default class Unauthorized extends Component {
    render() {
        return (
            <h1 className="flex layout-centered flex-full text-grey-2">Sorry, you are not authorized to view the specified page.</h1>
        );
    }
}
