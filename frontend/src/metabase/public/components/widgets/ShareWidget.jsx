/* @flow */
import React, { Component, PropTypes } from "react";

import Icon from "metabase/components/Icon";
import Button from "metabase/components/Button";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger";
import CopyWidget from "metabase/components/CopyWidget";
import Tooltip from "metabase/components/Tooltip";

import cx from "classnames";

const POPOVER_WIDTH = 325;

type Props = {
    uuid?: string,
    type: string,
    extensions: string[],
    onCreate: () => void,
    onDisable: () => void,
    isAdmin: bool,
    className?: string,
}

type State = {
    confirmDisable: boolean
}

export default class ShareWidget extends Component<*, Props, State> {
    state: State;
    props: Props;

    _popover: ?PopoverWithTrigger;

    constructor(props: Props) {
        super(props);
        this.state = {
            confirmDisable: false
        }
    }

    static defaultProps = {
        extensions: [],
    }

    render() {
        const { className, uuid, type, extensions, isAdmin, onCreate, onDisable } = this.props;
        const { confirmDisable } = this.state;

        let links;
        if (uuid) {
            const baseLink = `${document.location.origin}/public/${type}/${uuid}`;
            links = [{
                name: type,
                link: baseLink
            }].concat(extensions.map(extension => ({
                name: extension.toUpperCase(),
                link: `${baseLink}.${extension.toLowerCase()}` })
            ));
        }

        return (
            <PopoverWithTrigger
                ref={p => this._popover = p}
                triggerElement={
                    <Tooltip tooltip={isAdmin && !uuid ? "Create public links" : "Links"}>
                        <Icon name="link" />
                    </Tooltip>
                }
                triggerClasses={cx(className, "text-brand-hover")}
            >
                { confirmDisable ?
                    <div className="p2" style={{ width: POPOVER_WIDTH }}>
                        <div className="text-bold">Disable these links?</div>
                        <div className="py2">
                            They won't work any more, and can't be restored, but you can create new links.
                        </div>
                        <div>
                            <Button onClick={() => this.setState({ confirmDisable: false })}>Cancel</Button>
                            <Button className="ml1" warning onClick={() => {
                                onDisable();
                                this.setState({ confirmDisable: false })
                                if (this._popover) {
                                    this._popover.close();
                                }
                            }}>Disable</Button>
                        </div>
                    </div>
                : uuid ?
                    <div style={{ width: POPOVER_WIDTH }}>
                        <div className="p2">
                            { links && links.map(({ name, link }) =>
                                <div className="pt1 pb2">
                                    <div className="text-bold pb1">Public link to {name}</div>
                                    <CopyWidget value={link} />
                                </div>
                            )}
                        </div>
                        { isAdmin &&
                            <div className="border-top flex flex-column align-center">
                                <div
                                    className="text-warning cursor-pointer flex align-center p2"
                                    onClick={() => this.setState({ confirmDisable: true })}
                                >
                                    <Icon name="close" className="mr1" />
                                    Disable links
                                </div>
                            </div>
                        }
                    </div>
                :
                    <div className="p2 flex layout-centered">
                        { isAdmin ?
                            <Button className="text-brand" borderless onClick={onCreate}>
                                Create public link
                            </Button>
                        :
                            "Only administrators can create public links"
                        }
                    </div>
                }
            </PopoverWithTrigger>
        );
    }
}
