import React, { Component } from "react";
import { Link } from "react-router";

import * as Urls from "metabase/lib/urls";

export default class NotFound extends Component {
    render() {
        return (
            <div className="layout-centered flex full">
                <div className="p4 text-bold">
                    <h1 className="text-brand text-light mb3">We're a little lost...</h1>
                    <p className="h4 mb1">The page you asked for couldn't be found.</p>
                    <p className="h4">You might've been tricked by a ninja, but in all likelihood, you were just given a bad link.</p>
                    <p className="h4 my4">You can always:</p>
                    <div className="flex align-center">
                        <Link to={Urls.question()} className="Button Button--primary">
                            <div className="p1">Ask a new question.</div>
                        </Link>
                        <span className="mx2">or</span>
                        <a className="Button Button--withIcon" target="_blank" href="http://tv.giphy.com/kitten">
                            <div className="p1 flex align-center relative">
                                <span className="h2">😸</span>
                                <span className="ml1">Take a kitten break.</span>
                            </div>
                        </a>
                    </div>
                </div>
            </div>
        );
    }
}
