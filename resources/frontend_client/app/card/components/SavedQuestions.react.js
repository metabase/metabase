"use strict";

import React, { Component, PropTypes } from "react";

import Cards from "./Cards.react";
import CardFilters from "./CardFilters.react";


export default class SavedQuestions extends Component {

    render() {
        return (
            <div className="flex flex-column flex-full">
                <div className="relative felx flex-column flex-full md-pl4">
                    <div className="HomeLayout">
                        <div className="HomeLayout-mainColumn">
                            <div style={{paddingLeft: "0.75rem"}} className="pt4 h2 text-normal">Saved Questions</div>
                            <Cards {...this.props} />
                        </div>
                    </div>
                    <div className="HomeLayout-sidebar">
                        <CardFilters {...this.props} />
                    </div>
                </div>
            </div>
        );
    }
}

SavedQuestions.propTypes = {
    dispatch: PropTypes.func.isRequired
};
