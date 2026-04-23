import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKeyConstraint, Index, Integer, PrimaryKeyConstraint, String, Text, text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class Campaign(Base):
    __tablename__ = "campaign"
    __table_args__ = (
        PrimaryKeyConstraint("id", name="campaign_pkey"),
        Index("idx_campaign_state", "state"),
        Index("idx_campaign_type", "type"),
        {"schema": "customerio_data"},
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    created: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    updated: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    _fivetran_synced: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    type: Mapped[str | None] = mapped_column(String(50))
    state: Mapped[str | None] = mapped_column(String(50))
    _fivetran_deleted: Mapped[bool | None] = mapped_column(Boolean, server_default=text("false"))

    campaign_action: Mapped[list["CampaignAction"]] = relationship("CampaignAction", back_populates="campaign")
    deliveries: Mapped[list["Deliveries"]] = relationship("Deliveries", back_populates="campaign")


class Customer(Base):
    __tablename__ = "customer"
    __table_args__ = (
        PrimaryKeyConstraint("id", name="customer_pkey"),
        Index("idx_customer_created", "created_at"),
        Index("idx_customer_email", "email"),
        Index("idx_customer_unsubscribed", "unsubscribed"),
        {"schema": "customerio_data"},
    )

    id: Mapped[str] = mapped_column(String(255), primary_key=True)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    updated_at: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    _fivetran_synced: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    email: Mapped[str | None] = mapped_column(String(255))
    unsubscribed: Mapped[bool | None] = mapped_column(Boolean, server_default=text("false"))
    _fivetran_deleted: Mapped[bool | None] = mapped_column(Boolean, server_default=text("false"))

    deliveries: Mapped[list["Deliveries"]] = relationship("Deliveries", back_populates="customer")
    unsubscribes: Mapped[list["Unsubscribes"]] = relationship("Unsubscribes", back_populates="customer")


class Newsletter(Base):
    __tablename__ = "newsletter"
    __table_args__ = (PrimaryKeyConstraint("id", name="newsletter_pkey"), {"schema": "customerio_data"})

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    created: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    updated: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    _fivetran_synced: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    _fivetran_deleted: Mapped[bool | None] = mapped_column(Boolean, server_default=text("false"))

    deliveries: Mapped[list["Deliveries"]] = relationship("Deliveries", back_populates="newsletter")


class CampaignAction(Base):
    __tablename__ = "campaign_action"
    __table_args__ = (
        ForeignKeyConstraint(["campaign_id"], ["customerio_data.campaign.id"], name="campaign_action_campaign_id_fkey"),
        PrimaryKeyConstraint("id", name="campaign_action_pkey"),
        Index("idx_campaign_action_campaign", "campaign_id"),
        Index("idx_campaign_action_type", "type"),
        {"schema": "customerio_data"},
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    campaign_id: Mapped[int] = mapped_column(Integer, nullable=False)
    created: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    updated: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    _fivetran_synced: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    name: Mapped[str | None] = mapped_column(String(255))
    type: Mapped[str | None] = mapped_column(String(50))
    _fivetran_deleted: Mapped[bool | None] = mapped_column(Boolean, server_default=text("false"))

    campaign: Mapped["Campaign"] = relationship("Campaign", back_populates="campaign_action")
    deliveries: Mapped[list["Deliveries"]] = relationship("Deliveries", back_populates="action")


class Deliveries(Base):
    __tablename__ = "deliveries"
    __table_args__ = (
        ForeignKeyConstraint(["action_id"], ["customerio_data.campaign_action.id"], name="deliveries_action_id_fkey"),
        ForeignKeyConstraint(["campaign_id"], ["customerio_data.campaign.id"], name="deliveries_campaign_id_fkey"),
        ForeignKeyConstraint(["customer_id"], ["customerio_data.customer.id"], name="deliveries_customer_id_fkey"),
        ForeignKeyConstraint(
            ["newsletter_id"], ["customerio_data.newsletter.id"], name="deliveries_newsletter_id_fkey"
        ),
        PrimaryKeyConstraint("delivery_id", name="deliveries_pkey"),
        Index("idx_deliveries_campaign", "campaign_id"),
        Index("idx_deliveries_created", "created_at"),
        Index("idx_deliveries_customer", "customer_id"),
        {"schema": "customerio_data"},
    )

    delivery_id: Mapped[str] = mapped_column(String(255), primary_key=True)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    _fivetran_synced: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    customer_id: Mapped[str | None] = mapped_column(String(255))
    action_id: Mapped[int | None] = mapped_column(Integer)
    campaign_id: Mapped[int | None] = mapped_column(Integer)
    newsletter_id: Mapped[int | None] = mapped_column(Integer)
    subject: Mapped[str | None] = mapped_column(String(500))
    _fivetran_deleted: Mapped[bool | None] = mapped_column(Boolean, server_default=text("false"))

    action: Mapped[Optional["CampaignAction"]] = relationship("CampaignAction", back_populates="deliveries")
    campaign: Mapped[Optional["Campaign"]] = relationship("Campaign", back_populates="deliveries")
    customer: Mapped[Optional["Customer"]] = relationship("Customer", back_populates="deliveries")
    newsletter: Mapped[Optional["Newsletter"]] = relationship("Newsletter", back_populates="deliveries")
    bounces: Mapped[list["Bounces"]] = relationship("Bounces", back_populates="delivery")
    clicks: Mapped[list["Clicks"]] = relationship("Clicks", back_populates="delivery")
    opens: Mapped[list["Opens"]] = relationship("Opens", back_populates="delivery")
    spam_complaints: Mapped[list["SpamComplaints"]] = relationship("SpamComplaints", back_populates="delivery")
    unsubscribes: Mapped[list["Unsubscribes"]] = relationship("Unsubscribes", back_populates="delivery")


class Bounces(Base):
    __tablename__ = "bounces"
    __table_args__ = (
        ForeignKeyConstraint(
            ["delivery_id"], ["customerio_data.deliveries.delivery_id"], name="bounces_delivery_id_fkey"
        ),
        PrimaryKeyConstraint("delivery_id", "timestamp", name="bounces_pkey"),
        Index("idx_bounces_timestamp", "timestamp"),
        Index("idx_bounces_type", "bounce_type"),
        {"schema": "customerio_data"},
    )

    delivery_id: Mapped[str] = mapped_column(String(255), primary_key=True)
    timestamp: Mapped[datetime.datetime] = mapped_column(DateTime, primary_key=True)
    _fivetran_synced: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    bounce_type: Mapped[str | None] = mapped_column(String(50))
    reason: Mapped[str | None] = mapped_column(Text)
    _fivetran_deleted: Mapped[bool | None] = mapped_column(Boolean, server_default=text("false"))

    delivery: Mapped["Deliveries"] = relationship("Deliveries", back_populates="bounces")


class Clicks(Base):
    __tablename__ = "clicks"
    __table_args__ = (
        ForeignKeyConstraint(
            ["delivery_id"], ["customerio_data.deliveries.delivery_id"], name="clicks_delivery_id_fkey"
        ),
        PrimaryKeyConstraint("delivery_id", "timestamp", name="clicks_pkey"),
        Index("idx_clicks_timestamp", "timestamp"),
        {"schema": "customerio_data"},
    )

    delivery_id: Mapped[str] = mapped_column(String(255), primary_key=True)
    timestamp: Mapped[datetime.datetime] = mapped_column(DateTime, primary_key=True)
    _fivetran_synced: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    link_url: Mapped[str | None] = mapped_column(Text)
    _fivetran_deleted: Mapped[bool | None] = mapped_column(Boolean, server_default=text("false"))

    delivery: Mapped["Deliveries"] = relationship("Deliveries", back_populates="clicks")


class Opens(Base):
    __tablename__ = "opens"
    __table_args__ = (
        ForeignKeyConstraint(
            ["delivery_id"], ["customerio_data.deliveries.delivery_id"], name="opens_delivery_id_fkey"
        ),
        PrimaryKeyConstraint("delivery_id", "timestamp", name="opens_pkey"),
        Index("idx_opens_timestamp", "timestamp"),
        {"schema": "customerio_data"},
    )

    delivery_id: Mapped[str] = mapped_column(String(255), primary_key=True)
    timestamp: Mapped[datetime.datetime] = mapped_column(DateTime, primary_key=True)
    _fivetran_synced: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    _fivetran_deleted: Mapped[bool | None] = mapped_column(Boolean, server_default=text("false"))

    delivery: Mapped["Deliveries"] = relationship("Deliveries", back_populates="opens")


class SpamComplaints(Base):
    __tablename__ = "spam_complaints"
    __table_args__ = (
        ForeignKeyConstraint(
            ["delivery_id"], ["customerio_data.deliveries.delivery_id"], name="spam_complaints_delivery_id_fkey"
        ),
        PrimaryKeyConstraint("delivery_id", "timestamp", name="spam_complaints_pkey"),
        Index("idx_spam_complaints_timestamp", "timestamp"),
        {"schema": "customerio_data"},
    )

    delivery_id: Mapped[str] = mapped_column(String(255), primary_key=True)
    timestamp: Mapped[datetime.datetime] = mapped_column(DateTime, primary_key=True)
    _fivetran_synced: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    _fivetran_deleted: Mapped[bool | None] = mapped_column(Boolean, server_default=text("false"))

    delivery: Mapped["Deliveries"] = relationship("Deliveries", back_populates="spam_complaints")


class Unsubscribes(Base):
    __tablename__ = "unsubscribes"
    __table_args__ = (
        ForeignKeyConstraint(["customer_id"], ["customerio_data.customer.id"], name="unsubscribes_customer_id_fkey"),
        ForeignKeyConstraint(
            ["delivery_id"], ["customerio_data.deliveries.delivery_id"], name="unsubscribes_delivery_id_fkey"
        ),
        PrimaryKeyConstraint("delivery_id", "timestamp", name="unsubscribes_pkey"),
        Index("idx_unsubscribes_customer", "customer_id"),
        Index("idx_unsubscribes_timestamp", "timestamp"),
        {"schema": "customerio_data"},
    )

    delivery_id: Mapped[str] = mapped_column(String(255), primary_key=True)
    customer_id: Mapped[str] = mapped_column(String(255), nullable=False)
    timestamp: Mapped[datetime.datetime] = mapped_column(DateTime, primary_key=True)
    _fivetran_synced: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    _fivetran_deleted: Mapped[bool | None] = mapped_column(Boolean, server_default=text("false"))

    customer: Mapped["Customer"] = relationship("Customer", back_populates="unsubscribes")
    delivery: Mapped["Deliveries"] = relationship("Deliveries", back_populates="unsubscribes")
