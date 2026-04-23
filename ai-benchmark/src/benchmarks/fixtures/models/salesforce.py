import datetime
import decimal
from typing import Optional

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKeyConstraint,
    Index,
    Integer,
    Numeric,
    PrimaryKeyConstraint,
    String,
    text,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class Account(Base):
    __tablename__ = "account"
    __table_args__ = (
        PrimaryKeyConstraint("id", name="account_pkey"),
        Index("idx_account_created", "created_date"),
        Index("idx_account_industry", "industry"),
        Index("idx_account_owner", "owner_id"),
        {"schema": "salesforce_data"},
    )

    id: Mapped[str] = mapped_column(String(18), primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    created_date: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    last_modified_date: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    _fivetran_synced: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    type: Mapped[str | None] = mapped_column(String(100))
    industry: Mapped[str | None] = mapped_column(String(100))
    annual_revenue: Mapped[decimal.Decimal | None] = mapped_column(Numeric(18, 2))
    number_of_employees: Mapped[int | None] = mapped_column(Integer)
    owner_id: Mapped[str | None] = mapped_column(String(18))
    is_deleted: Mapped[bool | None] = mapped_column(Boolean, server_default=text("false"))
    _fivetran_deleted: Mapped[bool | None] = mapped_column(Boolean, server_default=text("false"))

    contact: Mapped[list["Contact"]] = relationship("Contact", back_populates="account")
    opportunity: Mapped[list["Opportunity"]] = relationship("Opportunity", back_populates="account")
    case: Mapped[list["Case"]] = relationship("Case", back_populates="account")


class Campaign(Base):
    __tablename__ = "campaign"
    __table_args__ = (
        PrimaryKeyConstraint("id", name="campaign_pkey"),
        Index("idx_campaign_start", "start_date"),
        Index("idx_campaign_status", "status"),
        {"schema": "salesforce_data"},
    )

    id: Mapped[str] = mapped_column(String(18), primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    created_date: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    _fivetran_synced: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    type: Mapped[str | None] = mapped_column(String(100))
    status: Mapped[str | None] = mapped_column(String(100))
    start_date: Mapped[datetime.date | None] = mapped_column(Date)
    end_date: Mapped[datetime.date | None] = mapped_column(Date)
    budgeted_cost: Mapped[decimal.Decimal | None] = mapped_column(Numeric(18, 2))
    actual_cost: Mapped[decimal.Decimal | None] = mapped_column(Numeric(18, 2))
    expected_revenue: Mapped[decimal.Decimal | None] = mapped_column(Numeric(18, 2))
    owner_id: Mapped[str | None] = mapped_column(String(18))
    _fivetran_deleted: Mapped[bool | None] = mapped_column(Boolean, server_default=text("false"))


class Event(Base):
    __tablename__ = "event"
    __table_args__ = (
        PrimaryKeyConstraint("id", name="event_pkey"),
        Index("idx_event_owner", "owner_id"),
        Index("idx_event_start", "start_date_time"),
        {"schema": "salesforce_data"},
    )

    id: Mapped[str] = mapped_column(String(18), primary_key=True)
    start_date_time: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    created_date: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    _fivetran_synced: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    who_id: Mapped[str | None] = mapped_column(String(18))
    what_id: Mapped[str | None] = mapped_column(String(18))
    subject: Mapped[str | None] = mapped_column(String(255))
    end_date_time: Mapped[datetime.datetime | None] = mapped_column(DateTime)
    duration_in_minutes: Mapped[int | None] = mapped_column(Integer)
    owner_id: Mapped[str | None] = mapped_column(String(18))
    _fivetran_deleted: Mapped[bool | None] = mapped_column(Boolean, server_default=text("false"))


class Lead(Base):
    __tablename__ = "lead"
    __table_args__ = (
        PrimaryKeyConstraint("id", name="lead_pkey"),
        Index("idx_lead_converted", "is_converted"),
        Index("idx_lead_email", "email"),
        Index("idx_lead_owner", "owner_id"),
        Index("idx_lead_status", "status"),
        {"schema": "salesforce_data"},
    )

    id: Mapped[str] = mapped_column(String(18), primary_key=True)
    last_name: Mapped[str] = mapped_column(String(100), nullable=False)
    company: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(String(100), nullable=False)
    created_date: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    last_modified_date: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    _fivetran_synced: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    first_name: Mapped[str | None] = mapped_column(String(100))
    email: Mapped[str | None] = mapped_column(String(255))
    source: Mapped[str | None] = mapped_column(String(100))
    rating: Mapped[str | None] = mapped_column(String(50))
    is_converted: Mapped[bool | None] = mapped_column(Boolean, server_default=text("false"))
    converted_date: Mapped[datetime.date | None] = mapped_column(Date)
    converted_account_id: Mapped[str | None] = mapped_column(String(18))
    converted_contact_id: Mapped[str | None] = mapped_column(String(18))
    converted_opportunity_id: Mapped[str | None] = mapped_column(String(18))
    owner_id: Mapped[str | None] = mapped_column(String(18))
    _fivetran_deleted: Mapped[bool | None] = mapped_column(Boolean, server_default=text("false"))


class Task(Base):
    __tablename__ = "task"
    __table_args__ = (
        PrimaryKeyConstraint("id", name="task_pkey"),
        Index("idx_task_activity_date", "activity_date"),
        Index("idx_task_owner", "owner_id"),
        Index("idx_task_status", "status"),
        {"schema": "salesforce_data"},
    )

    id: Mapped[str] = mapped_column(String(18), primary_key=True)
    created_date: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    _fivetran_synced: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    who_id: Mapped[str | None] = mapped_column(String(18))
    what_id: Mapped[str | None] = mapped_column(String(18))
    subject: Mapped[str | None] = mapped_column(String(255))
    status: Mapped[str | None] = mapped_column(String(100))
    priority: Mapped[str | None] = mapped_column(String(50))
    activity_date: Mapped[datetime.date | None] = mapped_column(Date)
    is_closed: Mapped[bool | None] = mapped_column(Boolean, server_default=text("false"))
    owner_id: Mapped[str | None] = mapped_column(String(18))
    _fivetran_deleted: Mapped[bool | None] = mapped_column(Boolean, server_default=text("false"))


class User(Base):
    __tablename__ = "user"
    __table_args__ = (
        PrimaryKeyConstraint("id", name="user_pkey"),
        Index("idx_user_active", "is_active"),
        Index("idx_user_email", "email"),
        {"schema": "salesforce_data"},
    )

    id: Mapped[str] = mapped_column(String(18), primary_key=True)
    username: Mapped[str] = mapped_column(String(255), nullable=False)
    last_name: Mapped[str] = mapped_column(String(100), nullable=False)
    created_date: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    last_modified_date: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    _fivetran_synced: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    first_name: Mapped[str | None] = mapped_column(String(100))
    email: Mapped[str | None] = mapped_column(String(255))
    is_active: Mapped[bool | None] = mapped_column(Boolean, server_default=text("true"))
    user_role_id: Mapped[str | None] = mapped_column(String(18))
    profile_id: Mapped[str | None] = mapped_column(String(18))
    _fivetran_deleted: Mapped[bool | None] = mapped_column(Boolean, server_default=text("false"))


class Contact(Base):
    __tablename__ = "contact"
    __table_args__ = (
        ForeignKeyConstraint(["account_id"], ["salesforce_data.account.id"], name="contact_account_id_fkey"),
        PrimaryKeyConstraint("id", name="contact_pkey"),
        Index("idx_contact_account", "account_id"),
        Index("idx_contact_email", "email"),
        Index("idx_contact_owner", "owner_id"),
        {"schema": "salesforce_data"},
    )

    id: Mapped[str] = mapped_column(String(18), primary_key=True)
    last_name: Mapped[str] = mapped_column(String(100), nullable=False)
    created_date: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    last_modified_date: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    _fivetran_synced: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    account_id: Mapped[str | None] = mapped_column(String(18))
    first_name: Mapped[str | None] = mapped_column(String(100))
    email: Mapped[str | None] = mapped_column(String(255))
    phone: Mapped[str | None] = mapped_column(String(40))
    title: Mapped[str | None] = mapped_column(String(128))
    owner_id: Mapped[str | None] = mapped_column(String(18))
    is_deleted: Mapped[bool | None] = mapped_column(Boolean, server_default=text("false"))
    _fivetran_deleted: Mapped[bool | None] = mapped_column(Boolean, server_default=text("false"))

    account: Mapped[Optional["Account"]] = relationship("Account", back_populates="contact")
    case: Mapped[list["Case"]] = relationship("Case", back_populates="contact")


class Opportunity(Base):
    __tablename__ = "opportunity"
    __table_args__ = (
        ForeignKeyConstraint(["account_id"], ["salesforce_data.account.id"], name="opportunity_account_id_fkey"),
        PrimaryKeyConstraint("id", name="opportunity_pkey"),
        Index("idx_opportunity_account", "account_id"),
        Index("idx_opportunity_close_date", "close_date"),
        Index("idx_opportunity_owner", "owner_id"),
        Index("idx_opportunity_stage", "stage_name"),
        {"schema": "salesforce_data"},
    )

    id: Mapped[str] = mapped_column(String(18), primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    stage_name: Mapped[str] = mapped_column(String(100), nullable=False)
    close_date: Mapped[datetime.date] = mapped_column(Date, nullable=False)
    created_date: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    last_modified_date: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    _fivetran_synced: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    account_id: Mapped[str | None] = mapped_column(String(18))
    amount: Mapped[decimal.Decimal | None] = mapped_column(Numeric(18, 2))
    probability: Mapped[decimal.Decimal | None] = mapped_column(Numeric(5, 2))
    type: Mapped[str | None] = mapped_column(String(100))
    lead_source: Mapped[str | None] = mapped_column(String(100))
    is_closed: Mapped[bool | None] = mapped_column(Boolean, server_default=text("false"))
    is_won: Mapped[bool | None] = mapped_column(Boolean, server_default=text("false"))
    owner_id: Mapped[str | None] = mapped_column(String(18))
    _fivetran_deleted: Mapped[bool | None] = mapped_column(Boolean, server_default=text("false"))

    account: Mapped[Optional["Account"]] = relationship("Account", back_populates="opportunity")
    opportunity_history: Mapped[list["OpportunityHistory"]] = relationship(
        "OpportunityHistory", back_populates="opportunity"
    )


class Case(Base):
    __tablename__ = "case"
    __table_args__ = (
        ForeignKeyConstraint(["account_id"], ["salesforce_data.account.id"], name="case_account_id_fkey"),
        ForeignKeyConstraint(["contact_id"], ["salesforce_data.contact.id"], name="case_contact_id_fkey"),
        PrimaryKeyConstraint("id", name="case_pkey"),
        Index("idx_case_account", "account_id"),
        Index("idx_case_contact", "contact_id"),
        Index("idx_case_status", "status"),
        {"schema": "salesforce_data"},
    )

    id: Mapped[str] = mapped_column(String(18), primary_key=True)
    status: Mapped[str] = mapped_column(String(100), nullable=False)
    created_date: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    _fivetran_synced: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    account_id: Mapped[str | None] = mapped_column(String(18))
    contact_id: Mapped[str | None] = mapped_column(String(18))
    subject: Mapped[str | None] = mapped_column(String(255))
    priority: Mapped[str | None] = mapped_column(String(50))
    origin: Mapped[str | None] = mapped_column(String(100))
    type: Mapped[str | None] = mapped_column(String(100))
    is_closed: Mapped[bool | None] = mapped_column(Boolean, server_default=text("false"))
    closed_date: Mapped[datetime.datetime | None] = mapped_column(DateTime)
    owner_id: Mapped[str | None] = mapped_column(String(18))
    _fivetran_deleted: Mapped[bool | None] = mapped_column(Boolean, server_default=text("false"))

    account: Mapped[Optional["Account"]] = relationship("Account", back_populates="case")
    contact: Mapped[Optional["Contact"]] = relationship("Contact", back_populates="case")


class OpportunityHistory(Base):
    __tablename__ = "opportunity_history"
    __table_args__ = (
        ForeignKeyConstraint(
            ["opportunity_id"], ["salesforce_data.opportunity.id"], name="opportunity_history_opportunity_id_fkey"
        ),
        PrimaryKeyConstraint("id", name="opportunity_history_pkey"),
        Index("idx_opp_history_created", "created_date"),
        Index("idx_opp_history_opportunity", "opportunity_id"),
        {"schema": "salesforce_data"},
    )

    id: Mapped[str] = mapped_column(String(18), primary_key=True)
    opportunity_id: Mapped[str] = mapped_column(String(18), nullable=False)
    stage_name: Mapped[str] = mapped_column(String(100), nullable=False)
    created_date: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    _fivetran_synced: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    amount: Mapped[decimal.Decimal | None] = mapped_column(Numeric(18, 2))
    probability: Mapped[decimal.Decimal | None] = mapped_column(Numeric(5, 2))
    _fivetran_deleted: Mapped[bool | None] = mapped_column(Boolean, server_default=text("false"))

    opportunity: Mapped["Opportunity"] = relationship("Opportunity", back_populates="opportunity_history")
