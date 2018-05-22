//
//  LoadingView.m
//  Metabase
//
//  Created by Cam Saul on 10/14/15.
//  Copyright (c) 2015 Metabase. All rights reserved.
//

@import QuartzCore;

#import "LoadingView.h"

@interface LoadingView ()
@property (weak) IBOutlet NSImageView *outerImageView;
@end

@implementation LoadingView

#pragma mark - Lifecycle

- (instancetype)init {
	NSArray *objects;
	[[NSBundle mainBundle] loadNibNamed:NSStringFromClass([self class]) owner:nil topLevelObjects:&objects];
	for (id obj in objects) {
		if ([obj isMemberOfClass:[self class]]) return obj;
	}
	return nil;
}

- (void)awakeFromNib {
	self.outerImageView.wantsLayer = YES;
}


#pragma mark - Getters / Setters

- (void)setAnimate:(BOOL)animate {
	if (_animate == animate) return;
	
	_animate = animate;
	
	if (!animate) {
		[self.outerImageView.layer removeAllAnimations];
	} else {
		self.outerImageView.layer.position = CGPointMake(CGRectGetMidX(self.bounds), CGRectGetMidY(self.bounds));
		self.outerImageView.layer.anchorPoint = CGPointMake(0.5f, 0.5f);
		
		CABasicAnimation *rotation	= [CABasicAnimation animationWithKeyPath:@"transform.rotation.z"];
		rotation.fromValue			= @(M_PI * 2.0f);
		rotation.toValue			= @0.0f; 
		rotation.duration			= 2.0f;
		rotation.repeatCount		= HUGE_VALF;
		
		[self.outerImageView.layer addAnimation:rotation forKey:@"rotation"];
	}
}

@end
