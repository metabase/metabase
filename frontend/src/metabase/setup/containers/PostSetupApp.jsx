import React, { Component } from "react";

import Button from "metabase/components/Button";
import { Link } from "react-router";
import ExplorePane from "metabase/components/ExplorePane";
import MetabotLogo from "metabase/components/MetabotLogo";

import { MetabaseApi, AutoApi } from "metabase/services";
import _ from "underscore";
import cx from "classnames";

import { delay } from "metabase/lib/promise";

export default class PostSetupApp extends Component {
  state = {
    skip: false,
    databaseId: null,
    isSample: null,
    candidates: null,
  };
  async componentWillMount() {
    const [sampleDbs, otherDbs] = _.partition(
      await MetabaseApi.db_list(),
      db => db.is_sample,
    );
    if (otherDbs.length > 0) {
      this.setState(
        { databaseId: otherDbs[0].id, isSample: false },
        this._loadCandidates,
      );
    } else {
      this.setState(
        { databaseId: sampleDbs[0].id, isSample: true },
        this._loadCandidates,
      );
    }
    this._timer = setInterval(this._loadCandidates, 5000);
  }
  componentWillUnmount() {
    this._clearTimer();
  }
  _clearTimer() {
    if (this._timer != null) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }
  _loadCandidates = async () => {
    try {
      // FIXME: the speed-up loop
      await delay(4000);
      const candidates = await AutoApi.db_candidates({
        id: this.state.databaseId,
      });
      if (candidates && candidates.length > 0) {
        this._clearTimer();
        this.setState({ candidates });
      }
    } catch (e) {
      console.log(e);
    }
  };
  render() {
    let { skip, candidates, isSample } = this.state;

    return (
      <div className="bg-slate-extra-light full-height flex layout-centered">
        <div style={{ maxWidth: 587 }}>
          {skip ? (
            <div className="flex flex-column align-center">
              <h2>No problem!</h2>
              <div className="mt2 mx4 px4">
                Once we’re done crunching the numbers, you’ll see something like
                this on your homepage with links to some interesting
                explorations of your data.
              </div>
              <BorderedPanel className="my4">
                <PlaceholderExplorePane />
              </BorderedPanel>
              <Link to="/">
                <Button primary>Got it</Button>
              </Link>
            </div>
          ) : !candidates ? (
            <div>
              <h2 className="text-centered mx4 px4">
                We’re taking a minute to look for interesting things about your
                data.
              </h2>
              <BorderedPanel className="my4 flex">
                <MetabotLogo className="mr4" />
                <div className="flex-full">
                  <div className="mb1">
                    Metabot is looking for interesting tables…
                  </div>
                  <ThinProgressBar />
                </div>
              </BorderedPanel>
            </div>
          ) : (
            <ExplorePane options={candidates} isSample={isSample} />
          )}
          {!skip && (
            <div
              className="m4 text-centered cursor-pointer"
              onClick={() => this.setState({ skip: true })}
            >
              No thanks, I’ll set things up on my own
            </div>
          )}
        </div>
      </div>
    );
  }
}

const PLACEHOLDER_OPTIONS = [
  { title: "xxxx" },
  { title: "xxxxxxxxxx" },
  { title: "xxxxxxx" },
  { title: "xxxxxxxxxxx" },
];

const PlaceholderExplorePane = () => (
  <BorderedPanel
    className="text-redacted"
    style={{ filter: "grayscale(100%)", opacity: 0.5 }}
  >
    <ExplorePane options={PLACEHOLDER_OPTIONS} />
  </BorderedPanel>
);

const BorderedPanel = ({ className, style, children }) => (
  <div
    className={cx("bordered rounded shadowed bg-white p4", className)}
    style={style}
  >
    {children}
  </div>
);

const ThinProgressBar = () => (
  <div className="bg-brand" style={{ height: 6, borderRadius: 99 }}>
    <div
      style={{
        backgroundColor: "black",
        opacity: 0.15,
        height: 6,
        width: 52,
      }}
    />
  </div>
);
