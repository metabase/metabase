import datetime
import decimal

from sqlalchemy import (
    BigInteger,
    Boolean,
    Date,
    DateTime,
    ForeignKeyConstraint,
    Index,
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
        Index("idx_account_status", "status"),
        {"schema": "linkedin_ads_data"},
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    created_time: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    last_modified_time: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    _fivetran_synced: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    type: Mapped[str | None] = mapped_column(String(50))
    status: Mapped[str | None] = mapped_column(String(50))
    currency: Mapped[str | None] = mapped_column(String(3))
    _fivetran_deleted: Mapped[bool | None] = mapped_column(Boolean, server_default=text("false"))

    account_user: Mapped[list["AccountUser"]] = relationship("AccountUser", back_populates="account")
    campaign_group: Mapped[list["CampaignGroup"]] = relationship("CampaignGroup", back_populates="account")
    conversion: Mapped[list["Conversion"]] = relationship("Conversion", back_populates="account")


class AccountUser(Base):
    __tablename__ = "account_user"
    __table_args__ = (
        ForeignKeyConstraint(["account_id"], ["linkedin_ads_data.account.id"], name="account_user_account_id_fkey"),
        PrimaryKeyConstraint("account_id", "user_person_id", name="account_user_pkey"),
        Index("idx_account_user_role", "role"),
        {"schema": "linkedin_ads_data"},
    )

    account_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    user_person_id: Mapped[str] = mapped_column(String(100), primary_key=True)
    created_time: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    _fivetran_synced: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    role: Mapped[str | None] = mapped_column(String(50))
    _fivetran_deleted: Mapped[bool | None] = mapped_column(Boolean, server_default=text("false"))

    account: Mapped["Account"] = relationship("Account", back_populates="account_user")


class CampaignGroup(Base):
    __tablename__ = "campaign_group"
    __table_args__ = (
        ForeignKeyConstraint(["account_id"], ["linkedin_ads_data.account.id"], name="campaign_group_account_id_fkey"),
        PrimaryKeyConstraint("id", name="campaign_group_pkey"),
        Index("idx_campaign_group_account", "account_id"),
        Index("idx_campaign_group_status", "status"),
        {"schema": "linkedin_ads_data"},
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    account_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    created_time: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    last_modified_time: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    _fivetran_synced: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    status: Mapped[str | None] = mapped_column(String(50))
    run_schedule_start: Mapped[datetime.datetime | None] = mapped_column(DateTime)
    run_schedule_end: Mapped[datetime.datetime | None] = mapped_column(DateTime)
    total_budget_amount: Mapped[decimal.Decimal | None] = mapped_column(Numeric(18, 2))
    total_budget_currency: Mapped[str | None] = mapped_column(String(3))
    _fivetran_deleted: Mapped[bool | None] = mapped_column(Boolean, server_default=text("false"))

    account: Mapped["Account"] = relationship("Account", back_populates="campaign_group")
    campaign: Mapped[list["Campaign"]] = relationship("Campaign", back_populates="campaign_group")


class Conversion(Base):
    __tablename__ = "conversion"
    __table_args__ = (
        ForeignKeyConstraint(["account_id"], ["linkedin_ads_data.account.id"], name="conversion_account_id_fkey"),
        PrimaryKeyConstraint("id", name="conversion_pkey"),
        Index("idx_conversion_account", "account_id"),
        Index("idx_conversion_type", "type"),
        {"schema": "linkedin_ads_data"},
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    account_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    created_time: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    last_modified_time: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    _fivetran_synced: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    type: Mapped[str | None] = mapped_column(String(50))
    _fivetran_deleted: Mapped[bool | None] = mapped_column(Boolean, server_default=text("false"))

    account: Mapped["Account"] = relationship("Account", back_populates="conversion")


class Campaign(Base):
    __tablename__ = "campaign"
    __table_args__ = (
        ForeignKeyConstraint(
            ["campaign_group_id"], ["linkedin_ads_data.campaign_group.id"], name="campaign_campaign_group_id_fkey"
        ),
        PrimaryKeyConstraint("id", name="campaign_pkey"),
        Index("idx_campaign_group", "campaign_group_id"),
        Index("idx_campaign_status", "status"),
        Index("idx_campaign_type", "type"),
        {"schema": "linkedin_ads_data"},
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    campaign_group_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    created_time: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    last_modified_time: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    _fivetran_synced: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    type: Mapped[str | None] = mapped_column(String(50))
    status: Mapped[str | None] = mapped_column(String(50))
    cost_type: Mapped[str | None] = mapped_column(String(50))
    daily_budget_amount: Mapped[decimal.Decimal | None] = mapped_column(Numeric(18, 2))
    daily_budget_currency: Mapped[str | None] = mapped_column(String(3))
    unit_cost_amount: Mapped[decimal.Decimal | None] = mapped_column(Numeric(18, 2))
    objective_type: Mapped[str | None] = mapped_column(String(50))
    _fivetran_deleted: Mapped[bool | None] = mapped_column(Boolean, server_default=text("false"))

    campaign_group: Mapped["CampaignGroup"] = relationship("CampaignGroup", back_populates="campaign")
    ad_analytics_by_campaign: Mapped[list["AdAnalyticsByCampaign"]] = relationship(
        "AdAnalyticsByCampaign", back_populates="campaign"
    )
    campaign_demographics: Mapped[list["CampaignDemographics"]] = relationship(
        "CampaignDemographics", back_populates="campaign"
    )
    creative: Mapped[list["Creative"]] = relationship("Creative", back_populates="campaign")


class AdAnalyticsByCampaign(Base):
    __tablename__ = "ad_analytics_by_campaign"
    __table_args__ = (
        ForeignKeyConstraint(
            ["campaign_id"], ["linkedin_ads_data.campaign.id"], name="ad_analytics_by_campaign_campaign_id_fkey"
        ),
        PrimaryKeyConstraint("campaign_id", "day", name="ad_analytics_by_campaign_pkey"),
        Index("idx_ad_analytics_day", "day"),
        {"schema": "linkedin_ads_data"},
    )

    campaign_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    day: Mapped[datetime.date] = mapped_column(Date, primary_key=True)
    _fivetran_synced: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    impressions: Mapped[int | None] = mapped_column(BigInteger, server_default=text("0"))
    clicks: Mapped[int | None] = mapped_column(BigInteger, server_default=text("0"))
    cost_in_local_currency: Mapped[decimal.Decimal | None] = mapped_column(Numeric(18, 2), server_default=text("0"))
    external_website_conversions: Mapped[int | None] = mapped_column(BigInteger, server_default=text("0"))
    external_website_post_click_conversions: Mapped[int | None] = mapped_column(BigInteger, server_default=text("0"))
    external_website_post_view_conversions: Mapped[int | None] = mapped_column(BigInteger, server_default=text("0"))
    video_views: Mapped[int | None] = mapped_column(BigInteger, server_default=text("0"))
    leads: Mapped[int | None] = mapped_column(BigInteger, server_default=text("0"))
    _fivetran_deleted: Mapped[bool | None] = mapped_column(Boolean, server_default=text("false"))

    campaign: Mapped["Campaign"] = relationship("Campaign", back_populates="ad_analytics_by_campaign")


class CampaignDemographics(Base):
    __tablename__ = "campaign_demographics"
    __table_args__ = (
        ForeignKeyConstraint(
            ["campaign_id"], ["linkedin_ads_data.campaign.id"], name="campaign_demographics_campaign_id_fkey"
        ),
        PrimaryKeyConstraint(
            "campaign_id", "day", "country", "seniority", "job_function", name="campaign_demographics_pkey"
        ),
        Index("idx_campaign_demographics_country", "country"),
        Index("idx_campaign_demographics_day", "day"),
        {"schema": "linkedin_ads_data"},
    )

    campaign_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    day: Mapped[datetime.date] = mapped_column(Date, primary_key=True)
    country: Mapped[str] = mapped_column(String(2), primary_key=True)
    seniority: Mapped[str] = mapped_column(String(100), primary_key=True)
    job_function: Mapped[str] = mapped_column(String(100), primary_key=True)
    _fivetran_synced: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    impressions: Mapped[int | None] = mapped_column(BigInteger, server_default=text("0"))
    clicks: Mapped[int | None] = mapped_column(BigInteger, server_default=text("0"))
    cost_in_local_currency: Mapped[decimal.Decimal | None] = mapped_column(Numeric(18, 2), server_default=text("0"))
    _fivetran_deleted: Mapped[bool | None] = mapped_column(Boolean, server_default=text("false"))

    campaign: Mapped["Campaign"] = relationship("Campaign", back_populates="campaign_demographics")


class Creative(Base):
    __tablename__ = "creative"
    __table_args__ = (
        ForeignKeyConstraint(["campaign_id"], ["linkedin_ads_data.campaign.id"], name="creative_campaign_id_fkey"),
        PrimaryKeyConstraint("id", name="creative_pkey"),
        Index("idx_creative_campaign", "campaign_id"),
        Index("idx_creative_status", "status"),
        {"schema": "linkedin_ads_data"},
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    campaign_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    created_time: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    last_modified_time: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    _fivetran_synced: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    status: Mapped[str | None] = mapped_column(String(50))
    _fivetran_deleted: Mapped[bool | None] = mapped_column(Boolean, server_default=text("false"))

    campaign: Mapped["Campaign"] = relationship("Campaign", back_populates="creative")
    ad_analytics_by_creative: Mapped[list["AdAnalyticsByCreative"]] = relationship(
        "AdAnalyticsByCreative", back_populates="creative"
    )


class AdAnalyticsByCreative(Base):
    __tablename__ = "ad_analytics_by_creative"
    __table_args__ = (
        ForeignKeyConstraint(
            ["creative_id"], ["linkedin_ads_data.creative.id"], name="ad_analytics_by_creative_creative_id_fkey"
        ),
        PrimaryKeyConstraint("creative_id", "day", name="ad_analytics_by_creative_pkey"),
        Index("idx_creative_analytics_day", "day"),
        {"schema": "linkedin_ads_data"},
    )

    creative_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    day: Mapped[datetime.date] = mapped_column(Date, primary_key=True)
    _fivetran_synced: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    impressions: Mapped[int | None] = mapped_column(BigInteger, server_default=text("0"))
    clicks: Mapped[int | None] = mapped_column(BigInteger, server_default=text("0"))
    cost_in_local_currency: Mapped[decimal.Decimal | None] = mapped_column(Numeric(18, 2), server_default=text("0"))
    external_website_conversions: Mapped[int | None] = mapped_column(BigInteger, server_default=text("0"))
    video_views: Mapped[int | None] = mapped_column(BigInteger, server_default=text("0"))
    leads: Mapped[int | None] = mapped_column(BigInteger, server_default=text("0"))
    _fivetran_deleted: Mapped[bool | None] = mapped_column(Boolean, server_default=text("false"))

    creative: Mapped["Creative"] = relationship("Creative", back_populates="ad_analytics_by_creative")
