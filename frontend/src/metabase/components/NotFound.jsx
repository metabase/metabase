import React, { Component } from "react";
import { Link } from "react-router";
import { t } from "c-3po";
import * as Urls from "metabase/lib/urls";

// TODO: port to ErrorMessage for more consistent style

export default class NotFound extends Component {
  render() {
    return (
      <div className="layout-centered flex full">
        <div className="p4 text-bold">
          <h1 className="text-brand text-light mb3">{t`We're a little lost...`}</h1>
          <p className="h4 mb1">
            {t`The page you asked for couldn't be found`}.
          </p>
          <p className="h4">{t`You might've been tricked by a ninja, but in all likelihood, you were just given a bad link.`}</p>
          <p className="h4 my4">{t`You can always:`}</p>
          <div className="flex align-center">
            <Link to={Urls.question()} className="Button Button--primary">
              <div className="p1">{t`Ask a new question.`}</div>
            </Link>
            <span className="mx2">{t`or`}</span>
            <a
              className="Button Button--withIcon"
              target="_blank"
              href="https://giphy.com/tv/search/kitten"
            >
              <div className="p1 flex align-center relative">
                <span className="h2">😸</span>
                <span className="ml1">{t`Take a kitten break.`}</span>
              </div>
            </a>
          </div>
        </div>
      </div>
    );
  }
}
