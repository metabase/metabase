import React, { Component, PropTypes } from "react";

import Cards from "./Cards.jsx";
import CardFilters from "./CardFilters.jsx";


export default class SavedQuestions extends Component {
    static propTypes = {
        dispatch: PropTypes.func.isRequired
    };

    render() {
        return (
            <div className="full">
                  <div className="flex">
                      <div className="wrapper">
                          <div className="Layout-mainColumn">
                            <div className="pt4 h2 text-normal">Saved Questions</div>
                            <Cards {...this.props} />
                          </div>
                      </div>
                      <div className="Layout-sidebar flex-no-shrink">
                          <CardFilters {...this.props} />
                      </div>
                  </div>
            </div>
        );
    }
}
