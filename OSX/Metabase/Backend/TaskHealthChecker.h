//
//  TaskHealthChecker.h
//  Metabase
//
//  Created by Cam Saul on 10/9/15.
//  Copyright (c) 2015 Metabase. All rights reserved.
//

static NSString * const MetabaseTaskBecameHealthyNotification	= @"MetabaseTaskBecameHealthyNotification";
static NSString * const MetabaseTaskBecameUnhealthyNotification = @"MetabaseTaskBecameUnhealthyNotification";
static NSString * const MetabaseTaskTimedOutNotification		= @"MetabaseTaskTimedOutNotification";

/// Manages the MetabaseTask (server) and restarts it if it gets unresponsive
@interface TaskHealthChecker : NSObject

@property () NSUInteger port;

- (void)start;
- (void)stop;
- (void)resetTimeout;

- (CFAbsoluteTime)lastCheckTime;

@end
