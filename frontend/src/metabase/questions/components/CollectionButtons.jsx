import React, { Component } from "react";
import { Link } from "react-router";
import cx from "classnames";

import Icon from "metabase/components/Icon";
import ArchiveCollectionWidget from "../containers/ArchiveCollectionWidget";

const COLLECTION_ICON_SIZE = 64;

const COLLECTION_BOX_CLASSES = "relative block p4 hover-parent hover--visibility cursor-pointer text-centered transition-background";

const CollectionButtons = ({ collections, isAdmin, push }) =>
    <ol className="flex flex-wrap">
        { collections
            .map(collection => <CollectionButton {...collection} push={push} isAdmin={isAdmin} />)
            .concat(isAdmin ? [<NewCollectionButton push={push} />] : [])
            .map((element, index) =>
                <li key={index} className="mr4 mb4">
                    {element}
                </li>
            )
        }
    </ol>

class CollectionButton extends Component {
    constructor() {
        super();
        this.state = { hovered: false };
    }

    render () {
        const { id, name, color, slug, isAdmin } = this.props;
        return (
            <Link
                to={`/questions/collections/${slug}`}
                className="no-decoration"
                onMouseEnter={() => this.setState({ hovered: true })}
                onMouseLeave={() => this.setState({ hovered: false })}
            >
                <div
                    className={cx(COLLECTION_BOX_CLASSES, 'text-white-hover')}
                    style={{
                        width: 290,
                        height: 180,
                        borderRadius: 10,
                        backgroundColor: this.state.hovered ? color : '#fafafa'
                    }}
                >
                    { isAdmin &&
                        <div className="absolute top right mt2 mr2 hover-child">
                            <Link to={"/collections/permissions?collectionId=" + id} className="mr1">
                                <Icon name="lockoutline" tooltip="Set collection permissions" />
                            </Link>
                            <ArchiveCollectionWidget collectionId={id} />
                        </div>
                    }
                    <Icon
                        className="mb2 mt2"
                        name="collection"
                        size={COLLECTION_ICON_SIZE}
                        style={{ color: this.state.hovered ? '#fff' : color }}
                    />
                    <h3>{ name }</h3>
                </div>
            </Link>
        )
    }
}

const NewCollectionButton = ({ push }) =>
    <div
        className={cx(COLLECTION_BOX_CLASSES, 'bg-brand-hover', 'text-brand', 'text-white-hover', 'bg-grey-0')}
        style={{
            width: 290,
            height: 180,
            borderRadius: 10
        }}
        onClick={() => push(`/collections/create`)}
    >
        <div>
            <div
                className="flex align-center justify-center ml-auto mr-auto mb2 mt2"
                style={{
                    border: '2px solid #D8E8F5',
                    borderRadius: COLLECTION_ICON_SIZE,
                    height: COLLECTION_ICON_SIZE,
                    width: COLLECTION_ICON_SIZE,
                }}
            >
                <Icon
                    name="add"
                    width="32"
                    height="32"
                />
            </div>
        </div>
        <h3>New collection</h3>
    </div>

export default CollectionButtons;
