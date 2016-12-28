import React, { Component, PropTypes } from "react";
import { Link } from "react-router";

import Icon from "metabase/components/Icon";
import CollectionActions from "./CollectionActions";
import ArchiveCollectionWidget from "../containers/ArchiveCollectionWidget";

const COLLECTION_ICON_SIZE = 64;

const CollectionButtons = ({ collections, isAdmin, push }) =>
    <ol className="">
        { collections
            .map(collection => <CollectionButton {...collection} push={push} isAdmin={isAdmin} />)
            .concat(isAdmin ? [<NewCollectionButton push={push} />] : [])
            .map((element, index) =>
                <li key={index} className="inline-block pr2 pb2" style={{ width: "25%" }}>
                    {element}
                </li>
            )
        }
    </ol>

const NewCollectionButton = ({ push }) =>
    <div
        className="relative block p4 hover-parent cursor-pointer text-centered text-brand-hover bg-grey-0 bg-light-blue-hover no-decoration"
        style={{ borderRadius: 10 }}
        onClick={() => push(`/collections/create`)}
    >
        <div>
            <div
                className="flex align-center justify-center text-brand ml-auto mr-auto mb4 mt2"
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
        <h3 className="text-brand">New collection</h3>
    </div>

const CollectionButton = ({ id, name, color, slug, isAdmin, push }) =>
    <div
        className="relative block p4 hover-parent cursor-pointer hover--visibility text-centered text-brand-hover bg-grey-0 bg-light-blue-hover no-decoration"
        style={{ borderRadius: 10 }}
        onClick={() => push(`/questions/collections/${slug}`)}
    >
        { isAdmin &&
            <div className="absolute top right mt2 mr2 hover-child">
                <CollectionActions>
                    <Link to={"/collections/permissions?collectionId=" + id}>
                        <Icon name="lockoutline" tooltip="Set collection permissions" />
                    </Link>
                    <ArchiveCollectionWidget collectionId={id} />
                </CollectionActions>
            </div>
        }
        <Icon
            className="mb4 mt2"
            name="collection"
            size={COLLECTION_ICON_SIZE}
            style={{ color }}
        />
        <h3>{ name }</h3>
    </div>

export default CollectionButtons;
