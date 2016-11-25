import React, { Component, PropTypes } from "react";
import { connect } from "react-redux";

import HeaderWithBack from "metabase/components/HeaderWithBack";
import Icon from "metabase/components/Icon";
import Tooltip from "metabase/components/Tooltip";

import NewEntityList from "./NewEntityList";
import { selectSection } from "../questions";

const mapStateToProps = (state, props) => ({})

const mapDispatchToProps = ({
    selectSection
})

const CollectionActions = ({ actions }) =>
    <div>
        {actions.map(({ action, icon, name }, index) =>
            <Tooltip tooltip={name} key={index}>
                <Icon
                    className="cursor-pointer text-brand-hover ml3"
                    name={icon}
                    onClick={ () => action() }
                />
            </Tooltip>
        )}
    </div>

@connect(mapStateToProps, mapDispatchToProps)
class CollectionPage extends Component {
    componentWillMount () {
        this.props.selectSection('all');
    }
    render () {
        return (
            <div className="mx4 mt4">
                <div className="flex align-center">
                    <HeaderWithBack name="Collection" />
                    <div className="ml-auto">
                        <CollectionActions
                            actions={[
                                { name: 'Archive collection', icon: 'archive',  action: () => console.log('archive!') },
                                { name: 'Edit collection', icon: 'pencil',  action: () => console.log('edit!!') },
                                { name: 'Set permissions', icon: 'lock',  action: () => console.log('set perms!') },
                                { name: 'Info', icon: 'info', action: () => console.log('info!') },
                            ]}
                        />
                    </div>
                </div>
                <div className="mt4">
                    <NewEntityList />
                </div>
            </div>
        );
    }
}

export default CollectionPage;
