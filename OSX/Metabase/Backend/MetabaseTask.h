//
//  MetabaseTask.h
//  Metabase
//
//  Created by Cam Saul on 10/9/15.
//  Copyright (c) 2015 Metabase. All rights reserved.
//

#import "JavaTask.h"

/// Task for running the MetabaseServer
@interface MetabaseTask : JavaTask

/// Create (and launch) a task to run the Metabase backend server.
+ (MetabaseTask *)task;

- (void)launch;

/// Remove the task termination handler that pops up the 'Task died unexpectedly' alert.
/// For cases when we want to kill the Metabase task without freaking the user out, e.g. for Reset Password
- (void)disableTerminationAlert;

- (NSUInteger)port;

@end
